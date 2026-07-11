-- ============================================================================
-- v77: Per-system catalog scope for subscription_plans (Platform vs Simulator)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v76 public read, public.subscription_plans
--
-- Allows Platform and Simulator to have different catalog prices (e.g. lifetime).
-- Public pricing pages filter by catalog_scope + target_system.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v77: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

ALTER TABLE public.subscription_plans
    ADD COLUMN IF NOT EXISTS catalog_scope TEXT NOT NULL DEFAULT 'both';

ALTER TABLE public.subscription_plans
    DROP CONSTRAINT IF EXISTS subscription_plans_catalog_scope_check;

ALTER TABLE public.subscription_plans
    ADD CONSTRAINT subscription_plans_catalog_scope_check
    CHECK (catalog_scope IN ('platform', 'simulator', 'both'));

COMMENT ON COLUMN public.subscription_plans.catalog_scope IS
    'Which customer-facing pricing pages include this row: platform, simulator, or both.';

-- Remove every legacy UNIQUE on (plan_type, billing_cycle) before splitting lifetime rows.
DROP INDEX IF EXISTS public.idx_subscription_plans_unique;
DROP INDEX IF EXISTS idx_subscription_plans_unique;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'subscription_plans'
          AND c.contype = 'u'
    LOOP
        EXECUTE format('ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'subscription_plans'
          AND indexdef ILIKE '%UNIQUE%'
          AND indexdef ILIKE '%plan_type%'
          AND indexdef ILIKE '%billing_cycle%'
          AND indexdef NOT ILIKE '%catalog_scope%'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
    END LOOP;
END $$;

-- Platform-only tiers
UPDATE public.subscription_plans
SET catalog_scope = 'platform'
WHERE plan_type IN ('starter', 'enterprise', 'lifetime_starter', 'lifetime_professional', 'lifetime_enterprise')
  AND catalog_scope = 'both';

-- Simulator-only tiers
UPDATE public.subscription_plans
SET catalog_scope = 'simulator'
WHERE plan_type = 'basic'
  AND catalog_scope = 'both';

-- Split shared lifetime row so Platform and Simulator can price independently
-- 1) Re-scope the existing shared row to platform
UPDATE public.subscription_plans
SET catalog_scope = 'platform',
    simulator_included = FALSE
WHERE plan_type = 'lifetime'
  AND billing_cycle = 'lifetime'
  AND catalog_scope = 'both';

-- 2) Add a simulator-scoped lifetime row (requires legacy unique index removed above)
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
    COALESCE(NULLIF(TRIM(REPLACE(sp.plan_name, '(Simulator)', '')), ''), 'Lifetime Access') || ' (Simulator)',
    sp.plan_type,
    sp.billing_cycle,
    sp.price,
    sp.original_price,
    sp.currency,
    sp.member_limit,
    sp.project_limit,
    sp.additional_member_price,
    sp.features,
    FALSE,
    TRUE,
    sp.is_popular,
    sp.is_active,
    sp.display_order,
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

-- Sync simulator lifetime catalog price from the latest simulator subscription amount
UPDATE public.subscription_plans sp
SET price = latest.amount_paid,
    updated_at = NOW()
FROM (
    SELECT ss.amount_paid
    FROM sim.simulator_subscriptions ss
    WHERE ss.plan_type = 'lifetime'
      AND ss.amount_paid IS NOT NULL
      AND ss.amount_paid > 0
    ORDER BY COALESCE(ss.started_at, ss.created_at, ss.updated_at) DESC NULLS LAST
    LIMIT 1
) latest
WHERE sp.plan_type = 'lifetime'
  AND sp.billing_cycle = 'lifetime'
  AND sp.catalog_scope = 'simulator'
  AND latest.amount_paid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_catalog_unique
    ON public.subscription_plans(plan_type, billing_cycle, catalog_scope);

DROP FUNCTION IF EXISTS public.get_public_subscription_plans();
DROP FUNCTION IF EXISTS public.get_public_subscription_plans(TEXT);

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
              AND sp.catalog_scope IN ('simulator', 'both')
          )
      )
    ORDER BY sp.display_order ASC NULLS LAST, sp.plan_name ASC;
$$;

COMMENT ON FUNCTION public.get_public_subscription_plans(TEXT) IS
    'Active subscription_plans for a target system (platform | simulator).';

GRANT EXECUTE ON FUNCTION public.get_public_subscription_plans(TEXT) TO anon, authenticated, service_role;

-- Prefer scoped catalog row when admin syncs subscription amount to plan price
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
          OR (p_catalog_scope = 'simulator' AND catalog_scope IN ('simulator', 'both'))
          OR (p_catalog_scope = 'platform' AND catalog_scope IN ('platform', 'both'))
      )
    ORDER BY
        CASE
            WHEN p_catalog_scope IS NOT NULL AND catalog_scope = p_catalog_scope THEN 0
            WHEN catalog_scope = 'both' THEN 1
            ELSE 2
        END,
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
        COALESCE(p_catalog_scope, 'platform')
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
        COALESCE(p_catalog_scope, 'platform'),
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
