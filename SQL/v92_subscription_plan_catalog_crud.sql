-- ============================================================================
-- v92: Plan catalog full CRUD (create / update / delete subscription_plans)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v81 (sync_subscription_plan_price, set_subscription_plan_catalog_active)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v92: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- admin.create_subscription_plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_subscription_plan(
    p_plan_name TEXT,
    p_plan_type TEXT,
    p_billing_cycle TEXT,
    p_catalog_scope TEXT,
    p_price DECIMAL(10, 2),
    p_original_price DECIMAL(10, 2) DEFAULT NULL,
    p_currency TEXT DEFAULT 'USD',
    p_member_limit INTEGER DEFAULT NULL,
    p_project_limit INTEGER DEFAULT NULL,
    p_additional_member_price DECIMAL(10, 2) DEFAULT NULL,
    p_features JSONB DEFAULT '[]'::jsonb,
    p_platform_included BOOLEAN DEFAULT TRUE,
    p_simulator_included BOOLEAN DEFAULT FALSE,
    p_is_popular BOOLEAN DEFAULT FALSE,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_display_order INTEGER DEFAULT 0,
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_new_id UUID;
    v_features JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;

    IF NOT (
        admin.check_admin_permission(v_admin_user_id, 'subscriptions.edit')
        OR admin.check_admin_permission(v_admin_user_id, 'pricing.edit')
    ) THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.edit or pricing.edit required';
    END IF;

    IF p_plan_name IS NULL OR trim(p_plan_name) = '' THEN
        RAISE EXCEPTION 'Plan name is required';
    END IF;

    IF p_plan_type IS NULL OR trim(p_plan_type) = '' THEN
        RAISE EXCEPTION 'Plan type is required';
    END IF;

    IF p_billing_cycle IS NULL OR trim(p_billing_cycle) = '' THEN
        RAISE EXCEPTION 'Billing cycle is required';
    END IF;

    IF p_catalog_scope IS NULL OR p_catalog_scope NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Catalog scope must be platform, simulator, or both';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.subscription_plans sp
        WHERE sp.plan_type = p_plan_type
          AND sp.billing_cycle = p_billing_cycle
          AND sp.catalog_scope = p_catalog_scope
    ) THEN
        RAISE EXCEPTION 'A plan already exists for type %, billing cycle %, and system %',
            p_plan_type, p_billing_cycle, p_catalog_scope;
    END IF;

    v_features := COALESCE(p_features, '[]'::jsonb);
    IF jsonb_typeof(v_features) <> 'array' THEN
        RAISE EXCEPTION 'Features must be a JSON array';
    END IF;

    v_new_id := gen_random_uuid();

    INSERT INTO public.subscription_plans (
        id,
        plan_name,
        plan_type,
        billing_cycle,
        catalog_scope,
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
        display_order
    ) VALUES (
        v_new_id,
        trim(p_plan_name),
        p_plan_type,
        p_billing_cycle,
        p_catalog_scope,
        COALESCE(p_price, 0),
        p_original_price,
        COALESCE(NULLIF(upper(trim(p_currency)), ''), 'USD'),
        p_member_limit,
        p_project_limit,
        p_additional_member_price,
        v_features,
        COALESCE(p_platform_included, TRUE),
        COALESCE(p_simulator_included, FALSE),
        COALESCE(p_is_popular, FALSE),
        COALESCE(p_is_active, TRUE),
        COALESCE(p_display_order, 0)
    );

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'subscription_plan.create',
        'subscription_plan',
        v_new_id,
        jsonb_build_object(
            'plan_name', trim(p_plan_name),
            'plan_type', p_plan_type,
            'billing_cycle', p_billing_cycle,
            'catalog_scope', p_catalog_scope,
            'price', p_price,
            'reason', p_reason
        ),
        NULL,
        jsonb_build_object(
            'plan_name', trim(p_plan_name),
            'plan_type', p_plan_type,
            'billing_cycle', p_billing_cycle,
            'catalog_scope', p_catalog_scope,
            'price', p_price,
            'is_active', COALESCE(p_is_active, TRUE)
        )
    );

    RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.create_subscription_plan(
    TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL, TEXT, INTEGER, INTEGER, DECIMAL,
    JSONB, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, UUID, TEXT
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin.update_subscription_plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_subscription_plan(
    p_plan_id UUID,
    p_plan_name TEXT,
    p_price DECIMAL(10, 2),
    p_original_price DECIMAL(10, 2) DEFAULT NULL,
    p_currency TEXT DEFAULT NULL,
    p_member_limit INTEGER DEFAULT NULL,
    p_project_limit INTEGER DEFAULT NULL,
    p_additional_member_price DECIMAL(10, 2) DEFAULT NULL,
    p_features JSONB DEFAULT NULL,
    p_platform_included BOOLEAN DEFAULT NULL,
    p_simulator_included BOOLEAN DEFAULT NULL,
    p_is_popular BOOLEAN DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_display_order INTEGER DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_plan public.subscription_plans%ROWTYPE;
    v_prev JSONB;
    v_affected INTEGER;
    v_features JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;

    IF NOT (
        admin.check_admin_permission(v_admin_user_id, 'subscriptions.edit')
        OR admin.check_admin_permission(v_admin_user_id, 'pricing.edit')
    ) THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.edit or pricing.edit required';
    END IF;

    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE id = p_plan_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription plan not found';
    END IF;

    IF p_plan_name IS NULL OR trim(p_plan_name) = '' THEN
        RAISE EXCEPTION 'Plan name is required';
    END IF;

    IF p_features IS NOT NULL AND jsonb_typeof(p_features) <> 'array' THEN
        RAISE EXCEPTION 'Features must be a JSON array';
    END IF;

    v_prev := to_jsonb(v_plan);

    v_affected := admin.count_active_subscribers_for_plan(
        v_plan.plan_type,
        v_plan.billing_cycle,
        COALESCE(v_plan.catalog_scope, 'platform')
    );

    IF p_price IS NOT NULL AND v_plan.price IS DISTINCT FROM p_price THEN
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
            COALESCE(v_plan.catalog_scope, 'platform'),
            v_plan.plan_type,
            v_plan.billing_cycle,
            v_plan.price,
            p_price,
            COALESCE(NULLIF(upper(trim(p_currency)), ''), v_plan.currency),
            NOW(),
            v_admin_user_id,
            COALESCE(p_reason, 'Updated via plan catalog'),
            v_affected,
            jsonb_build_object('price', v_plan.price, 'original_price', v_plan.original_price),
            jsonb_build_object('price', p_price)
        );
    END IF;

    v_features := COALESCE(p_features, v_plan.features);

    UPDATE public.subscription_plans
    SET plan_name = trim(p_plan_name),
        price = COALESCE(p_price, price),
        original_price = COALESCE(p_original_price, original_price),
        currency = COALESCE(NULLIF(upper(trim(p_currency)), ''), currency),
        member_limit = COALESCE(p_member_limit, member_limit),
        project_limit = COALESCE(p_project_limit, project_limit),
        additional_member_price = COALESCE(p_additional_member_price, additional_member_price),
        features = v_features,
        platform_included = COALESCE(p_platform_included, platform_included),
        simulator_included = COALESCE(p_simulator_included, simulator_included),
        is_popular = COALESCE(p_is_popular, is_popular),
        is_active = COALESCE(p_is_active, is_active),
        display_order = COALESCE(p_display_order, display_order),
        updated_at = NOW()
    WHERE id = p_plan_id
    RETURNING * INTO v_plan;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'subscription_plan.update',
        'subscription_plan',
        v_plan.id,
        jsonb_build_object(
            'plan_type', v_plan.plan_type,
            'billing_cycle', v_plan.billing_cycle,
            'catalog_scope', v_plan.catalog_scope,
            'reason', p_reason
        ),
        v_prev,
        to_jsonb(v_plan)
    );

    RETURN v_plan.id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.update_subscription_plan(
    UUID, TEXT, DECIMAL, DECIMAL, TEXT, INTEGER, INTEGER, DECIMAL,
    JSONB, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, UUID, TEXT
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin.delete_subscription_plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_subscription_plan(
    p_plan_id UUID,
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_plan public.subscription_plans%ROWTYPE;
    v_sub_count INTEGER := 0;
    v_sim_count INTEGER := 0;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;

    IF NOT (
        admin.check_admin_permission(v_admin_user_id, 'subscriptions.edit')
        OR admin.check_admin_permission(v_admin_user_id, 'pricing.edit')
    ) THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.edit or pricing.edit required';
    END IF;

    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE id = p_plan_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription plan not found';
    END IF;

    IF v_plan.catalog_scope IN ('platform', 'both') THEN
        SELECT COUNT(*)::INTEGER INTO v_sub_count
        FROM public.platform_subscriptions ps
        WHERE ps.status IN ('active', 'trialing', 'past_due')
          AND public.normalize_subscription_catalog_plan_type(ps.plan_type, 'platform') = v_plan.plan_type
          AND ps.billing_cycle = v_plan.billing_cycle;
    END IF;

    IF v_plan.catalog_scope IN ('simulator', 'both')
       AND EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'sim' AND table_name = 'simulator_subscriptions'
       ) THEN
        SELECT COUNT(*)::INTEGER INTO v_sim_count
        FROM sim.simulator_subscriptions ss
        WHERE ss.status IN ('active', 'trialing', 'past_due')
          AND public.normalize_subscription_catalog_plan_type(ss.plan_type, 'simulator') = v_plan.plan_type
          AND ss.billing_cycle = v_plan.billing_cycle;
    END IF;

    IF (v_sub_count + v_sim_count) > 0 THEN
        RAISE EXCEPTION 'Cannot delete plan with active subscribers (% platform, % simulator). Deactivate the plan instead.',
            v_sub_count, v_sim_count;
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'subscription_plan.delete',
        'subscription_plan',
        v_plan.id,
        jsonb_build_object(
            'plan_name', v_plan.plan_name,
            'plan_type', v_plan.plan_type,
            'billing_cycle', v_plan.billing_cycle,
            'catalog_scope', v_plan.catalog_scope,
            'reason', p_reason
        ),
        to_jsonb(v_plan),
        NULL
    );

    DELETE FROM public.subscription_plans
    WHERE id = p_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.delete_subscription_plan(UUID, UUID, TEXT)
    TO authenticated, service_role;
