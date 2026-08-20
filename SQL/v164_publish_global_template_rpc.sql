-- =============================================================================
-- v164: Publish Global Template → sync into public/sim.pm_template_nodes
-- Plan: projectplans/v159_global_template_library_plan.md
-- Prerequisites:
--   Admin: v160–v163
--   Monorepo: SQL/v765_global_template_sync_rpc.sql (public.sync_global_template_node)
-- =============================================================================

CREATE OR REPLACE FUNCTION admin.publish_global_template(
    p_template_id UUID,
    p_admin_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin UUID;
    v_row admin.global_template_library%ROWTYPE;
    v_sync JSONB;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.publish') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.publish required';
    END IF;

    SELECT * INTO v_row
    FROM admin.global_template_library
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Global template not found';
    END IF;
    IF v_row.record_status <> 'live' THEN
        RAISE EXCEPTION 'Only live templates can be published (current status: %)', v_row.record_status;
    END IF;
    IF v_row.domain <> 'fields' THEN
        RAISE EXCEPTION 'Phase 1 publish supports domain=fields only';
    END IF;

    -- Cross-schema sync (monorepo-owned RPC)
    v_sync := public.sync_global_template_node(
        v_row.id,
        v_row.domain,
        v_row.name,
        v_row.description,
        v_row.category,
        COALESCE(v_row.record_version, 1),
        COALESCE(v_row.payload, '[]'::jsonb)
    );

    UPDATE admin.global_template_library SET
        synced_at = NOW(),
        synced_node_id = NULLIF(v_sync->>'sample_node_id', '')::uuid,
        synced_version = COALESCE(v_row.record_version, 1),
        updated_by = v_admin,
        updated_at = NOW()
    WHERE id = p_template_id;

    PERFORM admin.log_admin_action(
        v_admin,
        'global_template.publish',
        'global_template_library',
        p_template_id,
        jsonb_build_object(
            'notes', p_notes,
            'sync', v_sync
        )
    );

    RETURN jsonb_build_object(
        'template_id', p_template_id,
        'synced_at', NOW(),
        'sync', v_sync
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin.publish_global_template(UUID, UUID, TEXT) TO authenticated, service_role;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sync_global_template_node'
    ) THEN
        RAISE WARNING 'v164: public.sync_global_template_node missing — apply monorepo SQL/v765_global_template_sync_rpc.sql before publishing.';
    END IF;
    RAISE NOTICE 'v164_publish_global_template_rpc.sql applied';
END $$;
