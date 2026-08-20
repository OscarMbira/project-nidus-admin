-- =============================================================================
-- v175: Publish Global Templates to Platform and/or Simulator separately
-- Prerequisites: v174 (publish domains); monorepo v778 (sync p_target)
-- =============================================================================

ALTER TABLE admin.global_template_library
  ADD COLUMN IF NOT EXISTS platform_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_synced_version INTEGER,
  ADD COLUMN IF NOT EXISTS sim_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sim_synced_version INTEGER;

-- Backfill from legacy single sync stamp (treat past publishes as both targets)
UPDATE admin.global_template_library
SET
  platform_synced_at = COALESCE(platform_synced_at, synced_at),
  platform_synced_version = COALESCE(platform_synced_version, synced_version),
  sim_synced_at = COALESCE(sim_synced_at, synced_at),
  sim_synced_version = COALESCE(sim_synced_version, synced_version)
WHERE synced_at IS NOT NULL
  AND (platform_synced_at IS NULL OR sim_synced_at IS NULL);

CREATE OR REPLACE FUNCTION admin.publish_global_template(
    p_template_id UUID,
    p_admin_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_target TEXT DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_row admin.global_template_library%ROWTYPE;
    v_sync JSONB;
    v_target TEXT := lower(trim(COALESCE(p_target, 'both')));
    v_ver INTEGER;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.publish') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.publish required';
    END IF;
    IF NULLIF(trim(COALESCE(p_notes, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Publish notes are required';
    END IF;
    IF v_target NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid publish target: % (use platform, simulator, or both)', p_target;
    END IF;

    SELECT * INTO v_row
    FROM admin.global_template_library
    WHERE id = p_template_id
      AND record_status <> 'history';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Global template not found: %', p_template_id;
    END IF;
    IF v_row.record_status <> 'live' THEN
        RAISE EXCEPTION 'Only live templates can be published (status=%)', v_row.record_status;
    END IF;
    IF v_row.domain NOT IN (
        'fields', 'industry_plan', 'legacy_document', 'structured_list',
        'form_template', 'opa', 'process_template'
    ) THEN
        RAISE EXCEPTION 'Publish not supported for domain %', v_row.domain;
    END IF;

    v_ver := GREATEST(COALESCE(v_row.record_version, 1), 1);

    v_sync := public.sync_global_template_node(
        v_row.id,
        v_row.domain,
        v_row.name,
        v_row.description,
        v_row.category,
        v_ver,
        v_row.payload,
        v_target
    );

    UPDATE admin.global_template_library
    SET
        platform_synced_at = CASE
            WHEN v_target IN ('platform', 'both') THEN NOW()
            ELSE platform_synced_at
        END,
        platform_synced_version = CASE
            WHEN v_target IN ('platform', 'both') THEN v_ver
            ELSE platform_synced_version
        END,
        sim_synced_at = CASE
            WHEN v_target IN ('simulator', 'both') THEN NOW()
            ELSE sim_synced_at
        END,
        sim_synced_version = CASE
            WHEN v_target IN ('simulator', 'both') THEN v_ver
            ELSE sim_synced_version
        END,
        -- Legacy columns: fully synced only when both targets match current version
        synced_at = CASE
            WHEN (
                (CASE WHEN v_target IN ('platform', 'both') THEN NOW() ELSE platform_synced_at END) IS NOT NULL
                AND (CASE WHEN v_target IN ('simulator', 'both') THEN NOW() ELSE sim_synced_at END) IS NOT NULL
                AND (CASE WHEN v_target IN ('platform', 'both') THEN v_ver ELSE platform_synced_version END) >= v_ver
                AND (CASE WHEN v_target IN ('simulator', 'both') THEN v_ver ELSE sim_synced_version END) >= v_ver
            ) THEN NOW()
            ELSE synced_at
        END,
        synced_version = CASE
            WHEN (
                (CASE WHEN v_target IN ('platform', 'both') THEN NOW() ELSE platform_synced_at END) IS NOT NULL
                AND (CASE WHEN v_target IN ('simulator', 'both') THEN NOW() ELSE sim_synced_at END) IS NOT NULL
                AND (CASE WHEN v_target IN ('platform', 'both') THEN v_ver ELSE platform_synced_version END) >= v_ver
                AND (CASE WHEN v_target IN ('simulator', 'both') THEN v_ver ELSE sim_synced_version END) >= v_ver
            ) THEN v_ver
            ELSE synced_version
        END,
        updated_at = NOW(),
        updated_by = v_admin
    WHERE id = p_template_id;

    PERFORM admin.log_admin_action(
        v_admin, 'global_template.publish', 'global_template_library', p_template_id,
        jsonb_build_object('notes', trim(p_notes), 'target', v_target, 'sync', v_sync)
    );

    RETURN jsonb_build_object(
        'template_id', p_template_id,
        'domain', v_row.domain,
        'target', v_target,
        'sync', v_sync
    );
END;
$$;

-- Drop 3-arg overload if it remains alongside the new 4-arg (Postgres keeps both)
DROP FUNCTION IF EXISTS admin.publish_global_template(UUID, UUID, TEXT);

GRANT EXECUTE ON FUNCTION admin.publish_global_template(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'v175_publish_global_template_target.sql applied';
END $$;
