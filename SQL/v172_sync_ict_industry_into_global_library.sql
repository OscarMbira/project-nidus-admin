-- =============================================================================
-- v172: Pull ICT (industry_code = ict) into Admin Global Template Library
-- Prerequisites:
--   1. Monorepo SQL/v775_ict_industry_template_seed.sql applied to public catalog
--   2. Admin SQL/v170_sync_industry_plans_from_catalog_rpc.sql (sync RPC)
-- Idempotent: sync RPC skips existing industry_code values
-- Alternative: Global Template Library → Import missing from Platform (bootstrap)
-- =============================================================================

DO $$
DECLARE
    v_admin UUID;
    v_result JSONB;
    v_catalog_has_ict BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.pmo_industry_templates t
        WHERE t.industry_code = 'ict'
          AND COALESCE(t.is_deleted, FALSE) = FALSE
          AND COALESCE(t.is_active, TRUE) = TRUE
    ) INTO v_catalog_has_ict;

    IF NOT v_catalog_has_ict THEN
        RAISE EXCEPTION
            'v172: public.pmo_industry_templates has no active ict row — apply monorepo SQL/v775_ict_industry_template_seed.sql first';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin' AND p.proname = 'sync_industry_plan_templates_from_catalog'
    ) THEN
        RAISE EXCEPTION
            'v172: apply Admin SQL/v170_sync_industry_plans_from_catalog_rpc.sql first';
    END IF;

    SELECT au.id INTO v_admin
    FROM admin.admin_users au
    WHERE au.role = 'super_admin' AND au.activation_status = 'active'
    ORDER BY au.created_at NULLS LAST, au.id
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'v172: no active super_admin';
    END IF;

    v_result := admin.sync_industry_plan_templates_from_catalog(
        v_admin,
        'v172: sync ICT (and any other missing industries) into Global Template Library'
    );
    RAISE NOTICE 'v172 sync result: %', v_result;
END $$;
