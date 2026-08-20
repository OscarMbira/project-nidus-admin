-- =============================================================================
-- v162: Global Template Library — record lifecycle + authoriser seed
-- Plan: projectplans/v159_global_template_library_plan.md
-- Prerequisites: v160, v101 (record_lifecycle_config), v95/v97 lifecycle helpers
-- =============================================================================

-- Register table in the lifecycle allowlist (v96 only knew the 4 pilot tables)
CREATE OR REPLACE FUNCTION admin.resolve_lifecycle_table(p_table_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_table_name TEXT := lower(trim(COALESCE(p_table_name, '')));
BEGIN
    IF v_table_name IN ('public.subscription_plans', 'subscription_plans') THEN
        RETURN 'public.subscription_plans';
    ELSIF v_table_name IN ('admin.affiliates', 'affiliates') THEN
        RETURN 'admin.affiliates';
    ELSIF v_table_name IN ('admin.payment_gateways', 'payment_gateways') THEN
        RETURN 'admin.payment_gateways';
    ELSIF v_table_name IN ('admin.cancellation_reason_categories', 'cancellation_reason_categories') THEN
        RETURN 'admin.cancellation_reason_categories';
    ELSIF v_table_name IN ('admin.global_template_library', 'global_template_library') THEN
        RETURN 'admin.global_template_library';
    END IF;

    RAISE EXCEPTION 'Unsupported lifecycle table: %', p_table_name;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.resolve_lifecycle_table(TEXT) TO authenticated, service_role;

-- Ensure lifecycle columns exist (idempotent helper from v97)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin' AND p.proname = 'ensure_lifecycle_category_b'
    ) THEN
        PERFORM admin.ensure_lifecycle_category_b('global_template_library');
    END IF;
END $$;

INSERT INTO admin.record_lifecycle_config (
    id,
    table_name,
    approval_enabled,
    level_approval_mode,
    history_retention_days,
    auto_archive_enabled,
    archive_retention_years,
    is_active,
    configured_by
)
VALUES (
    'b8010001-0001-4001-8101-000000000160'::uuid,
    'global_template_library',
    TRUE,
    'any',
    90,
    FALSE,
    NULL,
    TRUE,
    NULL
)
ON CONFLICT (table_name) DO UPDATE SET
    approval_enabled = EXCLUDED.approval_enabled,
    level_approval_mode = EXCLUDED.level_approval_mode,
    history_retention_days = EXCLUDED.history_retention_days,
    auto_archive_enabled = EXCLUDED.auto_archive_enabled,
    archive_retention_years = EXCLUDED.archive_retention_years,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Authoriser: first active super_admin (or system_admin) as level-1 approver
INSERT INTO admin.record_authorisers (
    id,
    table_name,
    authoriser_admin_user_id,
    approval_level,
    role_label,
    is_active,
    created_by
)
SELECT
    'b8050001-0001-4001-8105-000000000160'::uuid,
    'global_template_library',
    au.id,
    1,
    CASE WHEN au.role = 'super_admin' THEN 'Super Admin' ELSE 'System Admin' END,
    TRUE,
    au.id
FROM admin.admin_users au
WHERE au.role IN ('super_admin', 'system_admin')
  AND au.activation_status = 'active'
ORDER BY
    CASE WHEN au.role = 'super_admin' THEN 0 ELSE 1 END,
    au.created_at
LIMIT 1
ON CONFLICT (table_name, authoriser_admin_user_id) DO UPDATE SET
    approval_level = EXCLUDED.approval_level,
    role_label = EXCLUDED.role_label,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE 'v162_global_template_library_lifecycle_seed.sql applied';
END $$;
