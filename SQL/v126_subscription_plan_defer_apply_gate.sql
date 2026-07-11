-- ============================================================================
-- v126: Subscription plan defer-apply gate
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v18.0_record_lifecycle_defer_apply_plan.md
-- Prerequisites: v125_record_lifecycle_authoriser_strictness.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_subscription_plans(p_target_system TEXT DEFAULT NULL)
RETURNS SETOF public.subscription_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
    v_has_record_status BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription_plans'
          AND column_name = 'record_status'
    )
    INTO v_has_record_status;

    RETURN QUERY
    SELECT sp.*
    FROM public.subscription_plans sp
    WHERE sp.is_active = TRUE
      AND (
          NOT v_has_record_status
          OR sp.record_status IN ('live', 'unauthorised')
      )
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_subscription_plans(TEXT) TO anon, authenticated, service_role;

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
    v_has_lifecycle_cols BOOLEAN;
    v_lifecycle_config JSONB;
    v_authoriser_count INTEGER := 0;
    v_governance_active BOOLEAN := FALSE;
    v_price_changed BOOLEAN := FALSE;
    v_has_changes BOOLEAN := FALSE;
    v_submission_batch_id UUID;
    v_proposed_changes JSONB := '{}'::jsonb;
    v_trimmed_name TEXT;
    v_currency TEXT;
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
    v_features := COALESCE(p_features, v_plan.features);
    v_trimmed_name := trim(p_plan_name);
    v_currency := COALESCE(NULLIF(upper(trim(p_currency)), ''), v_plan.currency);

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'subscription_plans'
          AND c.column_name IN ('record_status', 'root_record_id', 'record_version')
        GROUP BY c.table_schema, c.table_name
        HAVING COUNT(*) = 3
    )
    INTO v_has_lifecycle_cols;

    v_price_changed := (p_price IS NOT NULL AND v_plan.price IS DISTINCT FROM p_price);
    v_has_changes := (
        v_trimmed_name IS DISTINCT FROM v_plan.plan_name
        OR v_price_changed
        OR (p_original_price IS NOT NULL AND v_plan.original_price IS DISTINCT FROM p_original_price)
        OR (p_currency IS NOT NULL AND v_plan.currency IS DISTINCT FROM v_currency)
        OR (p_member_limit IS NOT NULL AND v_plan.member_limit IS DISTINCT FROM p_member_limit)
        OR (p_project_limit IS NOT NULL AND v_plan.project_limit IS DISTINCT FROM p_project_limit)
        OR (p_additional_member_price IS NOT NULL AND v_plan.additional_member_price IS DISTINCT FROM p_additional_member_price)
        OR (p_features IS NOT NULL AND v_plan.features IS DISTINCT FROM p_features)
        OR (p_platform_included IS NOT NULL AND v_plan.platform_included IS DISTINCT FROM p_platform_included)
        OR (p_simulator_included IS NOT NULL AND v_plan.simulator_included IS DISTINCT FROM p_simulator_included)
        OR (p_is_popular IS NOT NULL AND v_plan.is_popular IS DISTINCT FROM p_is_popular)
        OR (p_is_active IS NOT NULL AND v_plan.is_active IS DISTINCT FROM p_is_active)
        OR (p_display_order IS NOT NULL AND v_plan.display_order IS DISTINCT FROM p_display_order)
    );

    IF v_has_lifecycle_cols THEN
        v_lifecycle_config := admin.get_lifecycle_config('subscription_plans', v_admin_user_id);
        SELECT COUNT(*)::INTEGER
        INTO v_authoriser_count
        FROM admin.record_authorisers ra
        WHERE ra.table_name = 'subscription_plans'
          AND ra.is_active = TRUE;

        v_governance_active := COALESCE((v_lifecycle_config->>'approval_enabled')::BOOLEAN, FALSE)
            AND v_authoriser_count > 0;
    END IF;

    IF v_governance_active AND v_has_changes THEN
        IF v_trimmed_name IS DISTINCT FROM v_plan.plan_name THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('plan_name', v_trimmed_name);
        END IF;
        IF p_price IS NOT NULL AND v_plan.price IS DISTINCT FROM p_price THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('price', p_price);
        END IF;
        IF p_original_price IS NOT NULL AND v_plan.original_price IS DISTINCT FROM p_original_price THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('original_price', p_original_price);
        END IF;
        IF p_currency IS NOT NULL AND v_plan.currency IS DISTINCT FROM v_currency THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('currency', v_currency);
        END IF;
        IF p_member_limit IS NOT NULL AND v_plan.member_limit IS DISTINCT FROM p_member_limit THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('member_limit', p_member_limit);
        END IF;
        IF p_project_limit IS NOT NULL AND v_plan.project_limit IS DISTINCT FROM p_project_limit THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('project_limit', p_project_limit);
        END IF;
        IF p_additional_member_price IS NOT NULL AND v_plan.additional_member_price IS DISTINCT FROM p_additional_member_price THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('additional_member_price', p_additional_member_price);
        END IF;
        IF p_features IS NOT NULL AND v_plan.features IS DISTINCT FROM p_features THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('features', v_features);
        END IF;
        IF p_platform_included IS NOT NULL AND v_plan.platform_included IS DISTINCT FROM p_platform_included THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('platform_included', p_platform_included);
        END IF;
        IF p_simulator_included IS NOT NULL AND v_plan.simulator_included IS DISTINCT FROM p_simulator_included THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('simulator_included', p_simulator_included);
        END IF;
        IF p_is_popular IS NOT NULL AND v_plan.is_popular IS DISTINCT FROM p_is_popular THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('is_popular', p_is_popular);
        END IF;
        IF p_is_active IS NOT NULL AND v_plan.is_active IS DISTINCT FROM p_is_active THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('is_active', p_is_active);
        END IF;
        IF p_display_order IS NOT NULL AND v_plan.display_order IS DISTINCT FROM p_display_order THEN
            v_proposed_changes := v_proposed_changes || jsonb_build_object('display_order', p_display_order);
        END IF;

        v_submission_batch_id := admin.submit_for_authorisation(
            'subscription_plans',
            v_plan.id,
            COALESCE(v_plan.root_record_id, v_plan.id),
            v_admin_user_id,
            COALESCE(p_reason, 'Subscription plan change submitted for authorisation'),
            v_proposed_changes
        );

        PERFORM admin.log_admin_action(
            v_admin_user_id,
            'subscription_plan.update',
            'subscription_plan',
            v_plan.id,
            jsonb_build_object(
                'plan_type', v_plan.plan_type,
                'billing_cycle', v_plan.billing_cycle,
                'catalog_scope', v_plan.catalog_scope,
                'reason', p_reason,
                'governance_active', TRUE,
                'defer_apply', TRUE,
                'authorisation_batch_id', v_submission_batch_id,
                'proposed_changes', v_proposed_changes
            ),
            v_prev,
            v_prev
        );

        RETURN v_plan.id;
    END IF;

    v_affected := admin.count_active_subscribers_for_plan(
        v_plan.plan_type,
        v_plan.billing_cycle,
        COALESCE(v_plan.catalog_scope, 'platform')
    );

    IF v_price_changed AND NOT v_governance_active THEN
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
            v_currency,
            NOW(),
            v_admin_user_id,
            COALESCE(p_reason, 'Updated via plan catalog'),
            v_affected,
            jsonb_build_object('price', v_plan.price, 'original_price', v_plan.original_price),
            jsonb_build_object('price', p_price)
        );
    END IF;

    UPDATE public.subscription_plans
    SET plan_name = v_trimmed_name,
        price = COALESCE(p_price, price),
        original_price = COALESCE(p_original_price, original_price),
        currency = v_currency,
        member_limit = COALESCE(p_member_limit, member_limit),
        project_limit = COALESCE(p_project_limit, project_limit),
        additional_member_price = COALESCE(p_additional_member_price, additional_member_price),
        features = v_features,
        platform_included = COALESCE(p_platform_included, platform_included),
        simulator_included = COALESCE(p_simulator_included, simulator_included),
        is_popular = COALESCE(p_is_popular, is_popular),
        is_active = COALESCE(p_is_active, is_active),
        display_order = COALESCE(p_display_order, display_order),
        root_record_id = CASE
            WHEN v_has_lifecycle_cols THEN COALESCE(root_record_id, id)
            ELSE root_record_id
        END,
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
            'reason', p_reason,
            'governance_active', v_governance_active,
            'authorisation_batch_id', v_submission_batch_id
        ),
        v_prev,
        to_jsonb(v_plan)
    );

    RETURN v_plan.id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.update_subscription_plan(UUID, TEXT, DECIMAL, DECIMAL, TEXT, INTEGER, INTEGER, DECIMAL, JSONB, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, UUID, TEXT) TO authenticated, service_role;
