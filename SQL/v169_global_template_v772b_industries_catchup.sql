-- =============================================================================
-- v169: Catch up Global Template Library with Platform industry catalog
-- Prefer Admin SQL/v170_sync_industry_plans_from_catalog_rpc.sql (RPC + auto-sync).
-- This file remains as a thin wrapper for operators who already bookmarked v169.
-- Prerequisites: monorepo v772b batches applied; Admin v166; then preferably v170.
-- =============================================================================

-- Prefer full RPC if present
DO $$
DECLARE
    v_admin UUID;
    v_result JSONB;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin' AND p.proname = 'sync_industry_plan_templates_from_catalog'
    ) THEN
        SELECT au.id INTO v_admin
        FROM admin.admin_users au
        WHERE au.role = 'super_admin' AND au.activation_status = 'active'
        ORDER BY au.created_at NULLS LAST, au.id
        LIMIT 1;

        IF v_admin IS NULL THEN
            RAISE EXCEPTION 'v169: no active super_admin';
        END IF;

        v_result := admin.sync_industry_plan_templates_from_catalog(
            v_admin,
            'v169 wrapper → admin.sync_industry_plan_templates_from_catalog'
        );
        RAISE NOTICE 'v169 via v170 RPC: %', v_result;
        RETURN;
    END IF;

    RAISE EXCEPTION
        'v169: apply Admin SQL/v170_sync_industry_plans_from_catalog_rpc.sql first (defines sync RPC), then re-run this file — or use the Global Template Library “Sync from Platform catalog” button.';
END $$;
