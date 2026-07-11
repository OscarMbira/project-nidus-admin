-- ============================================================================
-- v60: Admin console read access for platform projects & simulator tables
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735 admin schema (admin.is_active_admin), v45 users/orgs RLS
--
-- Problem: Admin UI reads public.projects and sim.* via Supabase session.
-- Platform RLS only exposes rows to org members / active scenarios / own
-- certificates, so admin console pages show zero records.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Platform projects (public.projects)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS policy_projects_admin_console_select
    ON public.projects;

CREATE POLICY policy_projects_admin_console_select
    ON public.projects
    FOR SELECT
    TO authenticated
    USING (
        admin.is_active_admin()
        AND COALESCE(is_deleted, FALSE) = FALSE
    );

COMMENT ON POLICY policy_projects_admin_console_select
    ON public.projects IS
    'Active admin console sessions can list all non-deleted platform projects';

-- ---------------------------------------------------------------------------
-- Simulator scenarios — admins see all rows (including inactive templates)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS policy_scenarios_admin_console_select
    ON sim.scenarios;

CREATE POLICY policy_scenarios_admin_console_select
    ON sim.scenarios
    FOR SELECT
    TO authenticated
    USING (admin.is_active_admin());

COMMENT ON POLICY policy_scenarios_admin_console_select
    ON sim.scenarios IS
    'Active admin console sessions can list all simulator scenarios';

-- ---------------------------------------------------------------------------
-- Simulator certificates — admins see all issued certificates
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS policy_certificates_admin_console_select
    ON sim.certificates;

CREATE POLICY policy_certificates_admin_console_select
    ON sim.certificates
    FOR SELECT
    TO authenticated
    USING (admin.is_active_admin());

COMMENT ON POLICY policy_certificates_admin_console_select
    ON sim.certificates IS
    'Active admin console sessions can list all simulator certificates';

-- ---------------------------------------------------------------------------
-- Simulator learning paths — admins see inactive paths too
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS policy_learning_paths_admin_console_select
    ON sim.learning_paths;

CREATE POLICY policy_learning_paths_admin_console_select
    ON sim.learning_paths
    FOR SELECT
    TO authenticated
    USING (admin.is_active_admin());

COMMENT ON POLICY policy_learning_paths_admin_console_select
    ON sim.learning_paths IS
    'Active admin console sessions can list all simulator learning paths';
