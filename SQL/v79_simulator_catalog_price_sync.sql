-- ============================================================================
-- v79: Fix simulator catalog price sync (lifetime_professional → lifetime)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v78 simulator catalog isolation
--
-- Simulator subscriptions use plan_type lifetime_professional; catalog rows use
-- plan_type lifetime. Backfill and admin sync must normalize before matching.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v79: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_subscription_catalog_plan_type(
    p_plan_type TEXT,
    p_target_system TEXT DEFAULT 'platform'
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_target_system = 'simulator'
             AND p_plan_type IN ('lifetime_professional', 'lifetime_ultimate', 'lifetime_basic')
            THEN 'lifetime'
        WHEN p_target_system = 'platform' AND p_plan_type = 'lifetime_enterprise'
            THEN 'lifetime'
        ELSE p_plan_type
    END;
$$;

-- Simulator lifetime: correct features + price from latest paid lifetime subscription
UPDATE public.subscription_plans
SET plan_name = 'Lifetime Access',
    features = '[
        "Everything in Simulator Basic",
        "All scenarios (forever)",
        "All future updates",
        "No recurring fees",
        "Priority support"
    ]'::jsonb,
    member_limit = 100,
    project_limit = NULL,
    updated_at = NOW()
WHERE catalog_scope = 'simulator'
  AND plan_type = 'lifetime'
  AND billing_cycle = 'lifetime';

UPDATE public.subscription_plans sp
SET price = latest.amount_paid,
    updated_at = NOW()
FROM (
    SELECT ss.amount_paid
    FROM sim.simulator_subscriptions ss
    WHERE (
        ss.plan_type IN ('lifetime', 'lifetime_professional', 'lifetime_ultimate', 'lifetime_basic')
        OR (COALESCE(ss.is_lifetime, FALSE) = TRUE AND ss.billing_cycle = 'lifetime')
    )
      AND ss.amount_paid IS NOT NULL
      AND ss.amount_paid > 0
    ORDER BY COALESCE(ss.started_at, ss.created_at, ss.updated_at) DESC NULLS LAST
    LIMIT 1
) latest
WHERE sp.plan_type = 'lifetime'
  AND sp.billing_cycle = 'lifetime'
  AND sp.catalog_scope = 'simulator'
  AND latest.amount_paid IS NOT NULL;

-- Optional: sync simulator professional monthly from latest paid (non-trial) subscription
UPDATE public.subscription_plans sp
SET price = latest.amount_paid,
    updated_at = NOW()
FROM (
    SELECT ss.amount_paid
    FROM sim.simulator_subscriptions ss
    WHERE ss.plan_type = 'professional'
      AND ss.billing_cycle = 'monthly'
      AND ss.amount_paid IS NOT NULL
      AND ss.amount_paid > 0
      AND COALESCE(ss.status, '') NOT IN ('trialing', 'trial', 'canceled', 'cancelled')
    ORDER BY COALESCE(ss.started_at, ss.created_at, ss.updated_at) DESC NULLS LAST
    LIMIT 1
) latest
WHERE sp.plan_type = 'professional'
  AND sp.billing_cycle = 'monthly'
  AND sp.catalog_scope = 'simulator'
  AND latest.amount_paid IS NOT NULL
  AND sp.price IN (29.99, 0.00);

CREATE OR REPLACE FUNCTION admin.sync_subscription_plan_price(
    p_plan_type TEXT,
    p_billing_cycle TEXT,
    p_new_price DECIMAL(10, 2),
    p_admin_user_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_catalog_scope TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_plan public.subscription_plans%ROWTYPE;
    v_history_id UUID;
    v_affected INTEGER;
    v_prev JSONB;
    v_catalog_plan_type TEXT;
    v_catalog_billing_cycle TEXT;
    v_target_system TEXT;
BEGIN
    IF p_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;

    IF NOT (
        admin.check_admin_permission(p_admin_user_id, 'subscriptions.edit')
        OR admin.check_admin_permission(p_admin_user_id, 'pricing.edit')
    ) THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.edit or pricing.edit required';
    END IF;

    v_target_system := COALESCE(p_catalog_scope, 'platform');
    v_catalog_plan_type := public.normalize_subscription_catalog_plan_type(p_plan_type, v_target_system);
    v_catalog_billing_cycle := CASE
        WHEN p_billing_cycle = 'lifetime'
             OR v_catalog_plan_type = 'lifetime'
             OR p_plan_type LIKE 'lifetime_%'
            THEN 'lifetime'
        ELSE p_billing_cycle
    END;

    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE plan_type = v_catalog_plan_type
      AND billing_cycle = v_catalog_billing_cycle
      AND is_active = TRUE
      AND (
          p_catalog_scope IS NULL
          OR catalog_scope = p_catalog_scope
      )
    ORDER BY
        CASE WHEN p_catalog_scope IS NOT NULL AND catalog_scope = p_catalog_scope THEN 0 ELSE 1 END,
        display_order
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active subscription plan not found for % / %', v_catalog_plan_type, v_catalog_billing_cycle;
    END IF;

    IF v_plan.price = p_new_price THEN
        RETURN v_plan.id;
    END IF;

    v_affected := admin.count_active_subscribers_for_plan(
        v_plan.plan_type,
        v_plan.billing_cycle,
        COALESCE(p_catalog_scope, v_plan.catalog_scope, 'platform')
    );

    v_prev := jsonb_build_object(
        'price', v_plan.price,
        'original_price', v_plan.original_price,
        'is_active', v_plan.is_active
    );

    UPDATE public.subscription_plans
    SET price = p_new_price,
        updated_at = NOW()
    WHERE id = v_plan.id;

    INSERT INTO admin.pricing_change_history (
        plan_id,
        target_system,
        plan_type,
        billing_cycle,
        previous_price,
        new_price,
        currency,
        effective_date,
        changed_by,
        change_reason,
        affected_subscribers_count,
        previous_values,
        new_values
    )
    VALUES (
        v_plan.id,
        COALESCE(p_catalog_scope, v_plan.catalog_scope, 'platform'),
        v_plan.plan_type,
        v_plan.billing_cycle,
        v_plan.price,
        p_new_price,
        v_plan.currency,
        NOW(),
        p_admin_user_id,
        COALESCE(p_reason, 'Synced from subscription amount'),
        v_affected,
        v_prev,
        jsonb_build_object('price', p_new_price)
    )
    RETURNING id INTO v_history_id;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'subscription_plan.price_sync',
        'subscription_plan',
        v_plan.id::TEXT,
        jsonb_build_object(
            'subscription_plan_type', p_plan_type,
            'catalog_plan_type', v_catalog_plan_type,
            'billing_cycle', v_catalog_billing_cycle,
            'catalog_scope', v_plan.catalog_scope,
            'previous_price', v_plan.price,
            'new_price', p_new_price
        ),
        v_prev,
        jsonb_build_object('price', p_new_price),
        p_reason
    );

    RETURN v_history_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_subscription_catalog_plan_type(TEXT, TEXT) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION admin.sync_subscription_plan_price(
    TEXT, TEXT, DECIMAL, UUID, TEXT, TEXT
) TO authenticated, service_role;
