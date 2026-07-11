-- ============================================================================
-- v41: Ensure subscription feature persistence on admin update/create
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v13 subscription CRUD, v16 subscription features (re-applies if missing)
-- Idempotent: DROP old signature + CREATE OR REPLACE. Safe to re-run.
-- ============================================================================

DROP FUNCTION IF EXISTS admin.admin_update_subscription(
    UUID, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, BOOLEAN, TEXT
);

CREATE OR REPLACE FUNCTION admin.admin_update_subscription(
    p_subscription_id UUID,
    p_target_system TEXT,
    p_admin_user_id UUID,
    p_plan_type TEXT,
    p_status TEXT,
    p_billing_cycle TEXT DEFAULT NULL,
    p_amount_paid NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT NULL,
    p_started_at TIMESTAMPTZ DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_trial_end TIMESTAMPTZ DEFAULT NULL,
    p_next_billing_date TIMESTAMPTZ DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_is_lifetime BOOLEAN DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_features JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
    v_new JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.edit required';
    END IF;

    IF p_features IS NOT NULL AND jsonb_typeof(p_features) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'features must be a JSON array';
    END IF;

    IF p_target_system = 'platform' THEN
        SELECT to_jsonb(ps.*) INTO v_prev
        FROM public.platform_subscriptions ps
        WHERE ps.id = p_subscription_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Platform subscription not found: %', p_subscription_id;
        END IF;

        UPDATE public.platform_subscriptions
        SET plan_type = COALESCE(p_plan_type, plan_type),
            status = COALESCE(p_status, status),
            billing_cycle = COALESCE(p_billing_cycle, billing_cycle),
            amount_paid = COALESCE(p_amount_paid, amount_paid),
            currency = COALESCE(p_currency, currency),
            started_at = COALESCE(p_started_at, started_at),
            expires_at = p_expires_at,
            trial_end = p_trial_end,
            next_billing_date = p_next_billing_date,
            account_id = COALESCE(p_account_id, account_id),
            is_lifetime = COALESCE(p_is_lifetime, is_lifetime),
            is_trial = CASE WHEN p_status IS NOT NULL THEN (p_status = 'trialing') ELSE is_trial END,
            cancelled_at = CASE WHEN p_status = 'cancelled' AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END,
            custom_features = CASE
                WHEN p_features IS NULL THEN custom_features
                WHEN jsonb_typeof(custom_features) = 'object' THEN custom_features || jsonb_build_object('features', p_features)
                ELSE jsonb_build_object('features', p_features)
            END,
            updated_at = NOW()
        WHERE id = p_subscription_id
        RETURNING to_jsonb(platform_subscriptions.*) INTO v_new;
    ELSIF p_target_system = 'simulator' THEN
        SELECT to_jsonb(ss.*) INTO v_prev
        FROM sim.simulator_subscriptions ss
        WHERE ss.id = p_subscription_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Simulator subscription not found: %', p_subscription_id;
        END IF;

        UPDATE sim.simulator_subscriptions
        SET plan_type = COALESCE(p_plan_type, plan_type),
            status = COALESCE(p_status, status),
            billing_cycle = COALESCE(p_billing_cycle, billing_cycle),
            amount_paid = COALESCE(p_amount_paid, amount_paid),
            currency = COALESCE(p_currency, currency),
            started_at = COALESCE(p_started_at, started_at),
            expires_at = p_expires_at,
            next_billing_date = p_next_billing_date,
            is_lifetime = COALESCE(p_is_lifetime, is_lifetime),
            features = CASE WHEN p_features IS NULL THEN features ELSE p_features END,
            cancelled_at = CASE WHEN p_status = 'cancelled' AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END,
            updated_at = NOW()
        WHERE id = p_subscription_id
        RETURNING to_jsonb(simulator_subscriptions.*) INTO v_new;
    ELSE
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'subscription.update',
        'subscription',
        p_subscription_id,
        jsonb_build_object('target_system', p_target_system, 'reason', p_reason),
        v_prev,
        v_new
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.admin_update_subscription(
    UUID, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT,
    TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, BOOLEAN, TEXT, JSONB
) TO authenticated, service_role;
