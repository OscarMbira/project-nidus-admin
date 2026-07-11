-- ============================================================================
-- v736_03: Subscription & Revenue Read Functions
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01_admin_schema.sql, v735_02_admin_auth_functions.sql, v735_03_admin_subscription_functions.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.get_revenue_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_revenue_summary(
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    transaction_date DATE,
    total_amount NUMERIC,
    transaction_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
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

    IF p_date_from IS NULL OR p_date_to IS NULL THEN
        RAISE EXCEPTION 'Both date_from and date_to are required';
    END IF;

    IF p_date_to < p_date_from THEN
        RAISE EXCEPTION 'date_to (%) cannot be before date_from (%)', p_date_to, p_date_from;
    END IF;

    RETURN QUERY
    SELECT
        (pt.created_at AT TIME ZONE 'UTC')::DATE AS transaction_date,
        COALESCE(SUM(pt.amount), 0)::NUMERIC AS total_amount,
        COUNT(*)::BIGINT AS transaction_count
    FROM public.payment_transactions pt
    WHERE pt.status = 'paid'
      AND (pt.created_at AT TIME ZONE 'UTC')::DATE BETWEEN p_date_from AND p_date_to
    GROUP BY (pt.created_at AT TIME ZONE 'UTC')::DATE
    ORDER BY transaction_date ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_subscription_detail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_subscription_detail(
    p_subscription_id UUID
)
RETURNS TABLE (
    subscription_id UUID,
    user_id UUID,
    user_email TEXT,
    plan_type TEXT,
    billing_cycle TEXT,
    plan_name TEXT,
    subscription_status TEXT,
    amount_paid NUMERIC,
    currency TEXT,
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    next_billing_date TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
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

    IF NOT EXISTS (
        SELECT 1
        FROM public.platform_subscriptions ps
        WHERE ps.id = p_subscription_id
    ) THEN
        RAISE EXCEPTION 'Platform subscription not found: %', p_subscription_id;
    END IF;

    RETURN QUERY
    SELECT
        ps.id AS subscription_id,
        ps.user_id,
        au.email::TEXT AS user_email,
        ps.plan_type::TEXT,
        ps.billing_cycle::TEXT,
        sp.plan_name::TEXT,
        ps.status::TEXT AS subscription_status,
        ps.amount_paid::NUMERIC,
        ps.currency::TEXT,
        ps.started_at,
        ps.expires_at,
        ps.next_billing_date
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

GRANT EXECUTE ON FUNCTION admin.get_revenue_summary(DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_subscription_detail(UUID) TO authenticated, service_role;
