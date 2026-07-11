-- ============================================================================
-- v736_13: Subscription CRUD (create / update / delete)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_03_admin_subscription_functions.sql, v736_03_subscription_views.sql
-- ============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('subscriptions.create', 'Create Subscriptions', 'subscriptions', 'Create platform or simulator subscriptions'),
    ('subscriptions.delete', 'Delete Subscriptions', 'subscriptions', 'Permanently delete subscription records')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('subscriptions.create', 'subscriptions.delete')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'subscriptions.create'),
    ('system_admin', 'subscriptions.delete')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- admin.get_subscription_detail — support platform + simulator
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS admin.get_subscription_detail(UUID);

CREATE OR REPLACE FUNCTION admin.get_subscription_detail(
    p_subscription_id UUID,
    p_target_system TEXT DEFAULT 'platform'
)
RETURNS TABLE (
    subscription_id UUID,
    target_system TEXT,
    user_id UUID,
    user_email TEXT,
    account_id UUID,
    plan_type TEXT,
    billing_cycle TEXT,
    plan_name TEXT,
    subscription_status TEXT,
    amount_paid NUMERIC,
    currency TEXT,
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    next_billing_date TIMESTAMPTZ,
    is_lifetime BOOLEAN,
    is_trial BOOLEAN,
    grace_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := admin.current_admin_user_id();
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve current admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.view') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.view required';
    END IF;

    IF p_subscription_id IS NULL THEN
        RAISE EXCEPTION 'subscription_id is required';
    END IF;

    IF p_target_system = 'simulator' THEN
        IF NOT EXISTS (
            SELECT 1 FROM sim.simulator_subscriptions ss WHERE ss.id = p_subscription_id
        ) THEN
            RAISE EXCEPTION 'Simulator subscription not found: %', p_subscription_id;
        END IF;

        RETURN QUERY
        SELECT
            ss.id,
            'simulator'::TEXT,
            ss.user_id,
            au.email::TEXT,
            NULL::UUID,
            ss.plan_type::TEXT,
            ss.billing_cycle::TEXT,
            initcap(replace(ss.plan_type, '_', ' '))::TEXT,
            ss.status::TEXT,
            ss.amount_paid::NUMERIC,
            ss.currency::TEXT,
            ss.started_at,
            ss.expires_at,
            NULL::TIMESTAMPTZ,
            ss.next_billing_date,
            COALESCE(ss.is_lifetime, FALSE),
            (ss.status = 'trialing'),
            ss.grace_period_end,
            COALESCE(ss.cancel_at_period_end, FALSE)
        FROM sim.simulator_subscriptions ss
        LEFT JOIN auth.users au ON au.id = ss.user_id
        WHERE ss.id = p_subscription_id;

        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.platform_subscriptions ps WHERE ps.id = p_subscription_id
    ) THEN
        RAISE EXCEPTION 'Platform subscription not found: %', p_subscription_id;
    END IF;

    RETURN QUERY
    SELECT
        ps.id,
        'platform'::TEXT,
        ps.user_id,
        au.email::TEXT,
        ps.account_id,
        ps.plan_type::TEXT,
        ps.billing_cycle::TEXT,
        sp.plan_name::TEXT,
        ps.status::TEXT,
        ps.amount_paid::NUMERIC,
        ps.currency::TEXT,
        ps.started_at,
        ps.expires_at,
        ps.trial_end,
        ps.next_billing_date,
        COALESCE(ps.is_lifetime, FALSE),
        COALESCE(ps.is_trial, FALSE),
        ps.grace_period_end,
        COALESCE(ps.cancel_at_period_end, FALSE)
    FROM public.platform_subscriptions ps
    LEFT JOIN auth.users au ON au.id = ps.user_id
    LEFT JOIN public.subscription_plans sp
        ON sp.plan_type = ps.plan_type
       AND sp.billing_cycle = COALESCE(ps.billing_cycle, sp.billing_cycle)
       AND sp.is_active = TRUE
    WHERE ps.id = p_subscription_id
    ORDER BY sp.updated_at DESC NULLS LAST
    LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.admin_create_subscription
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.admin_create_subscription(
    p_target_system TEXT,
    p_admin_user_id UUID,
    p_user_id UUID,
    p_plan_type TEXT,
    p_status TEXT,
    p_billing_cycle TEXT DEFAULT 'monthly',
    p_amount_paid NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'USD',
    p_started_at TIMESTAMPTZ DEFAULT NOW(),
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_trial_end TIMESTAMPTZ DEFAULT NULL,
    p_next_billing_date TIMESTAMPTZ DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_is_lifetime BOOLEAN DEFAULT FALSE,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_subscription_id UUID;
    v_new JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.create') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.create required';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
        RAISE EXCEPTION 'Auth user not found: %', p_user_id;
    END IF;

    IF p_target_system = 'platform' THEN
        INSERT INTO public.platform_subscriptions (
            user_id,
            account_id,
            plan_type,
            status,
            billing_cycle,
            amount_paid,
            currency,
            started_at,
            expires_at,
            trial_end,
            next_billing_date,
            is_lifetime,
            is_trial,
            updated_at
        )
        VALUES (
            p_user_id,
            p_account_id,
            p_plan_type,
            p_status,
            p_billing_cycle,
            p_amount_paid,
            COALESCE(p_currency, 'USD'),
            COALESCE(p_started_at, NOW()),
            p_expires_at,
            p_trial_end,
            p_next_billing_date,
            COALESCE(p_is_lifetime, FALSE),
            (p_status = 'trialing'),
            NOW()
        )
        RETURNING id INTO v_subscription_id;
    ELSIF p_target_system = 'simulator' THEN
        INSERT INTO sim.simulator_subscriptions (
            user_id,
            plan_type,
            status,
            billing_cycle,
            amount_paid,
            currency,
            started_at,
            expires_at,
            next_billing_date,
            is_lifetime,
            updated_at
        )
        VALUES (
            p_user_id,
            p_plan_type,
            p_status,
            p_billing_cycle,
            p_amount_paid,
            COALESCE(p_currency, 'USD'),
            COALESCE(p_started_at, NOW()),
            p_expires_at,
            p_next_billing_date,
            COALESCE(p_is_lifetime, FALSE),
            NOW()
        )
        RETURNING id INTO v_subscription_id;
    ELSE
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    v_new := jsonb_build_object(
        'target_system', p_target_system,
        'user_id', p_user_id,
        'plan_type', p_plan_type,
        'status', p_status,
        'reason', p_reason
    );

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'subscription.create',
        'subscription',
        v_subscription_id,
        jsonb_build_object('target_system', p_target_system, 'reason', p_reason),
        NULL,
        v_new
    );

    RETURN v_subscription_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.admin_update_subscription
-- ---------------------------------------------------------------------------
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
    p_reason TEXT DEFAULT NULL
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

-- ---------------------------------------------------------------------------
-- admin.admin_delete_subscription
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.admin_delete_subscription(
    p_subscription_id UUID,
    p_target_system TEXT,
    p_admin_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.delete') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.delete required';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Deletion reason is required';
    END IF;

    IF p_target_system = 'platform' THEN
        SELECT to_jsonb(ps.*) INTO v_prev
        FROM public.platform_subscriptions ps
        WHERE ps.id = p_subscription_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Platform subscription not found: %', p_subscription_id;
        END IF;

        DELETE FROM public.platform_subscriptions WHERE id = p_subscription_id;
    ELSIF p_target_system = 'simulator' THEN
        SELECT to_jsonb(ss.*) INTO v_prev
        FROM sim.simulator_subscriptions ss
        WHERE ss.id = p_subscription_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Simulator subscription not found: %', p_subscription_id;
        END IF;

        DELETE FROM sim.simulator_subscriptions WHERE id = p_subscription_id;
    ELSE
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'subscription.delete',
        'subscription',
        p_subscription_id,
        jsonb_build_object('target_system', p_target_system, 'reason', trim(p_reason)),
        v_prev,
        NULL
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.get_subscription_detail(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_create_subscription(TEXT, UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_update_subscription(UUID, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_delete_subscription(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
