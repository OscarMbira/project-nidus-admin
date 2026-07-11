-- ============================================================================
-- v45: Admin console read access for platform users & organisations (accounts)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735 admin schema, v736_02 user/org management functions
--
-- Problem: Admin UI reads public.accounts (and public.users for org members)
-- directly via Supabase (anon + session). Existing RLS only allows account
-- owners/members or platform System Admin roles, so admin console users see
-- zero rows even when seed data exists.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.can_view_orgs()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'orgs.view'
       );
$$;

COMMENT ON FUNCTION admin.can_view_orgs() IS
    'TRUE when the authenticated session is an active admin with orgs.view';

GRANT EXECUTE ON FUNCTION admin.can_view_orgs() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION admin.can_view_users()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'users.view'
       );
$$;

COMMENT ON FUNCTION admin.can_view_users() IS
    'TRUE when the authenticated session is an active admin with users.view';

GRANT EXECUTE ON FUNCTION admin.can_view_users() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Organisations (public.accounts)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS policy_accounts_admin_console_select
    ON public.accounts;

CREATE POLICY policy_accounts_admin_console_select
    ON public.accounts
    FOR SELECT
    TO authenticated
    USING (
        admin.can_view_orgs()
        AND COALESCE(is_deleted, FALSE) = FALSE
    );

COMMENT ON POLICY policy_accounts_admin_console_select
    ON public.accounts IS
    'Admin console users with orgs.view can list all platform organisations';

-- ---------------------------------------------------------------------------
-- Platform users (org member lists, user directory)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS policy_users_admin_console_select
    ON public.users;

CREATE POLICY policy_users_admin_console_select
    ON public.users
    FOR SELECT
    TO authenticated
    USING (
        admin.can_view_users()
        AND COALESCE(is_deleted, FALSE) = FALSE
    );

COMMENT ON POLICY policy_users_admin_console_select
    ON public.users IS
    'Admin console users with users.view can list all platform users';

DO $$
BEGIN
    RAISE NOTICE 'v45: Admin users/orgs read RLS policies applied.';
END $$;
