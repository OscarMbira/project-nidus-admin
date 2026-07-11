-- ============================================================================
-- v37: Sync subscription_plans catalog price (subscriptions.edit OR pricing.edit)
-- PostgreSQL 15+ / Supabase
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.sync_subscription_plan_price(
    p_plan_type TEXT,
    p_billing_cycle TEXT,
    p_new_price DECIMAL(10, 2),
    p_admin_user_id UUID,
    p_reason TEXT DEFAULT NULL
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
    ORDER BY display_order
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
        'platform'
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
        'platform',
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

COMMENT ON FUNCTION admin.sync_subscription_plan_price IS
    'Update subscription_plans.price by plan type/cycle; allowed with subscriptions.edit or pricing.edit';

GRANT EXECUTE ON FUNCTION admin.sync_subscription_plan_price TO authenticated, service_role;
