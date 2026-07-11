-- ============================================================================
-- v15: Admin console read access for subscription billing tables
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01 admin schema, v735_02 auth functions
--
-- Problem: Admin UI reads platform_subscriptions / simulator_subscriptions
-- directly via Supabase (anon + session). Existing RLS only allows
-- auth.uid() = user_id (or platform user_roles), so admin console users
-- see zero rows even when seed data exists.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.can_view_subscriptions()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'subscriptions.view'
       );
$$;

COMMENT ON FUNCTION admin.can_view_subscriptions() IS
    'TRUE when the authenticated session is an active admin with subscriptions.view';

GRANT EXECUTE ON FUNCTION admin.can_view_subscriptions() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Platform subscriptions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS policy_platform_subscriptions_admin_console_select
    ON public.platform_subscriptions;

CREATE POLICY policy_platform_subscriptions_admin_console_select
    ON public.platform_subscriptions
    FOR SELECT
    TO authenticated
    USING (admin.can_view_subscriptions());

COMMENT ON POLICY policy_platform_subscriptions_admin_console_select
    ON public.platform_subscriptions IS
    'Admin console users with subscriptions.view can list all platform subscriptions';

-- ---------------------------------------------------------------------------
-- Simulator subscriptions
-- ---------------------------------------------------------------------------
GRANT SELECT ON sim.simulator_subscriptions TO authenticated;

DROP POLICY IF EXISTS policy_simulator_subscriptions_admin_console_select
    ON sim.simulator_subscriptions;

CREATE POLICY policy_simulator_subscriptions_admin_console_select
    ON sim.simulator_subscriptions
    FOR SELECT
    TO authenticated
    USING (admin.can_view_subscriptions());

COMMENT ON POLICY policy_simulator_subscriptions_admin_console_select
    ON sim.simulator_subscriptions IS
    'Admin console users with subscriptions.view can list all simulator subscriptions';

-- ---------------------------------------------------------------------------
-- Payment transactions (subscription detail Payments tab)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'payment_transactions'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS policy_payment_transactions_admin_console_select ON public.payment_transactions';
        EXECUTE '
            CREATE POLICY policy_payment_transactions_admin_console_select
                ON public.payment_transactions
                FOR SELECT
                TO authenticated
                USING (admin.can_view_subscriptions())';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'v15: Admin subscription read RLS policies applied.';
END $$;
