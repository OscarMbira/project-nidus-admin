-- ============================================================================
-- v78: Isolate Simulator catalog rows (single source of truth per system)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v77 catalog_scope column + idx_subscription_plans_catalog_unique
--
-- Simulator pricing must NOT inherit platform free/professional rows (catalog_scope=both).
-- Each system gets its own subscription_plans rows keyed by catalog_scope.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v78: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- Platform owns free + professional (and yearly variants); remove from simulator pages
UPDATE public.subscription_plans
SET catalog_scope = 'platform',
    simulator_included = FALSE,
    updated_at = NOW()
WHERE plan_type IN ('free', 'professional', 'starter', 'enterprise')
  AND catalog_scope IN ('both', 'platform');

UPDATE public.subscription_plans
SET catalog_scope = 'platform',
    simulator_included = FALSE,
    updated_at = NOW()
WHERE plan_type IN ('free', 'professional')
  AND billing_cycle = 'yearly'
  AND catalog_scope IN ('both', 'platform');

-- Simulator Free
INSERT INTO public.subscription_plans (
    id,
    plan_name,
    plan_type,
    billing_cycle,
    price,
    currency,
    member_limit,
    project_limit,
    additional_member_price,
    features,
    platform_included,
    simulator_included,
    is_popular,
    is_active,
    display_order,
    catalog_scope
) VALUES (
    'a7780001-0001-4000-8000-000000000001'::uuid,
    'Free',
    'free',
    'monthly',
    0.00,
    'USD',
    1,
    NULL,
    0.00,
    '[
        "5 beginner scenarios",
        "Basic scoring and feedback",
        "Progress tracking",
        "Community access"
    ]'::jsonb,
    FALSE,
    TRUE,
    FALSE,
    TRUE,
    1,
    'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    price = EXCLUDED.price,
    member_limit = EXCLUDED.member_limit,
    project_limit = EXCLUDED.project_limit,
    features = EXCLUDED.features,
    platform_included = EXCLUDED.platform_included,
    simulator_included = EXCLUDED.simulator_included,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Simulator Professional
INSERT INTO public.subscription_plans (
    id,
    plan_name,
    plan_type,
    billing_cycle,
    price,
    currency,
    member_limit,
    project_limit,
    additional_member_price,
    features,
    platform_included,
    simulator_included,
    is_popular,
    is_active,
    display_order,
    catalog_scope
) VALUES (
    'a7780002-0001-4000-8000-000000000001'::uuid,
    'Professional',
    'professional',
    'monthly',
    COALESCE(
        (
            SELECT ROUND(bp.price * 3, 2)
            FROM public.subscription_plans bp
            WHERE bp.catalog_scope = 'simulator'
              AND bp.plan_type = 'basic'
              AND bp.billing_cycle = 'monthly'
            LIMIT 1
        ),
        57.00
    ),
    'USD',
    100,
    NULL,
    0.00,
    '[
        "All scenarios (including expert)",
        "Advanced AI feedback",
        "Full progress tracking & analytics",
        "All certificates (discounted)",
        "Custom scenarios",
        "Priority support"
    ]'::jsonb,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    3,
    'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    member_limit = EXCLUDED.member_limit,
    project_limit = EXCLUDED.project_limit,
    features = EXCLUDED.features,
    platform_included = EXCLUDED.platform_included,
    simulator_included = EXCLUDED.simulator_included,
    is_popular = EXCLUDED.is_popular,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Ensure basic is simulator-scoped with sensible display order
UPDATE public.subscription_plans
SET catalog_scope = 'simulator',
    platform_included = FALSE,
    simulator_included = TRUE,
    display_order = 2,
    updated_at = NOW()
WHERE plan_type = 'basic'
  AND billing_cycle = 'monthly';

-- Ensure simulator lifetime row exists (copy from platform lifetime if missing)
INSERT INTO public.subscription_plans (
    plan_name,
    plan_type,
    billing_cycle,
    price,
    original_price,
    currency,
    member_limit,
    project_limit,
    additional_member_price,
    features,
    platform_included,
    simulator_included,
    is_popular,
    is_active,
    display_order,
    catalog_scope
)
SELECT
    'Lifetime Access',
    sp.plan_type,
    sp.billing_cycle,
    sp.price,
    sp.original_price,
    sp.currency,
    sp.member_limit,
    sp.project_limit,
    sp.additional_member_price,
    '[
        "All scenarios (forever)",
        "All Professional features",
        "All future updates",
        "No recurring fees",
        "Priority support"
    ]'::jsonb,
    FALSE,
    TRUE,
    sp.is_popular,
    sp.is_active,
    4,
    'simulator'
FROM public.subscription_plans sp
WHERE sp.plan_type = 'lifetime'
  AND sp.billing_cycle = 'lifetime'
  AND sp.catalog_scope = 'platform'
  AND NOT EXISTS (
      SELECT 1 FROM public.subscription_plans existing
      WHERE existing.plan_type = 'lifetime'
        AND existing.billing_cycle = 'lifetime'
        AND existing.catalog_scope = 'simulator'
  );

-- Sync simulator lifetime price from latest paid simulator subscription (e.g. $500)
UPDATE public.subscription_plans sp
SET price = latest.amount_paid,
    features = COALESCE(sp.features, '[]'::jsonb),
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

-- Normalize simulator display order
UPDATE public.subscription_plans SET display_order = 1, updated_at = NOW()
WHERE catalog_scope = 'simulator' AND plan_type = 'free' AND billing_cycle = 'monthly';

UPDATE public.subscription_plans SET display_order = 2, updated_at = NOW()
WHERE catalog_scope = 'simulator' AND plan_type = 'basic' AND billing_cycle = 'monthly';

UPDATE public.subscription_plans SET display_order = 3, updated_at = NOW()
WHERE catalog_scope = 'simulator' AND plan_type = 'professional' AND billing_cycle = 'monthly';

UPDATE public.subscription_plans SET display_order = 4, updated_at = NOW()
WHERE catalog_scope = 'simulator' AND plan_type = 'lifetime' AND billing_cycle = 'lifetime';

-- Strict per-system public catalog RPC
CREATE OR REPLACE FUNCTION public.get_public_subscription_plans(p_target_system TEXT DEFAULT NULL)
RETURNS SETOF public.subscription_plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT sp.*
    FROM public.subscription_plans sp
    WHERE sp.is_active = TRUE
      AND (
          p_target_system IS NULL
          OR (
              p_target_system = 'platform'
              AND sp.platform_included IS NOT FALSE
              AND sp.catalog_scope IN ('platform', 'both')
          )
          OR (
              p_target_system = 'simulator'
              AND sp.simulator_included IS NOT FALSE
              AND sp.catalog_scope = 'simulator'
          )
      )
    ORDER BY sp.display_order ASC NULLS LAST, sp.plan_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_subscription_plans(TEXT) TO anon, authenticated, service_role;

-- Admin price sync: match exact catalog_scope (no cross-system bleed)
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

    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE plan_type = p_plan_type
      AND billing_cycle = p_billing_cycle
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
        RAISE EXCEPTION 'Active subscription plan not found for % / %', p_plan_type, p_billing_cycle;
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
            'plan_type', v_plan.plan_type,
            'billing_cycle', v_plan.billing_cycle,
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

GRANT EXECUTE ON FUNCTION admin.sync_subscription_plan_price(
    TEXT, TEXT, DECIMAL, UUID, TEXT, TEXT
) TO authenticated, service_role;
