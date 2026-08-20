-- =============================================================================
-- v185: project_template domain + methodology on admin.global_template_library
-- Plan: projectplans/v188_global_templates_level_first_menu_plan.md
-- Companion monorepo: SQL/v785_project_template_domain_and_methodology.sql (apply first)
-- =============================================================================

ALTER TABLE admin.global_template_library
  ADD COLUMN IF NOT EXISTS methodology TEXT;

ALTER TABLE admin.global_template_library
  DROP CONSTRAINT IF EXISTS chk_gtl_methodology;
ALTER TABLE admin.global_template_library
  ADD CONSTRAINT chk_gtl_methodology CHECK (
    methodology IS NULL OR methodology IN ('pmbok', 'structured', 'agile')
  );

COMMENT ON COLUMN admin.global_template_library.methodology IS
  'Orthogonal track: pmbok | structured | agile. Distinct from category (phase/stage or free-text tag).';

ALTER TABLE admin.global_template_library
  DROP CONSTRAINT IF EXISTS chk_gtl_domain;

ALTER TABLE admin.global_template_library
  ADD CONSTRAINT chk_gtl_domain CHECK (
    domain IN (
      'fields', 'form_template', 'industry_plan', 'opa', 'process_template',
      'legacy_document', 'structured_list',
      'portfolio_template', 'programme_template', 'project_template'
    )
  );

COMMENT ON COLUMN admin.global_template_library.payload IS
  'fields: JSON array. Other domains: JSON object including portfolio/programme/project_template.';

-- Backfill existing Portfolio/Programme seeds as PMBOK-style governance content
UPDATE admin.global_template_library
SET methodology = 'pmbok',
    updated_at = NOW()
WHERE domain IN ('portfolio_template', 'programme_template')
  AND methodology IS NULL;

CREATE OR REPLACE FUNCTION admin.create_global_template(
    p_domain TEXT,
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT '[]'::jsonb,
    p_admin_user_id UUID DEFAULT NULL,
    p_methodology TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_id UUID;
    v_payload JSONB;
    v_methodology TEXT;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.edit required';
    END IF;
    IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'name is required';
    END IF;
    IF p_domain IS NULL OR p_domain NOT IN (
        'fields', 'industry_plan', 'legacy_document', 'structured_list',
            'form_template', 'opa', 'process_template',
            'portfolio_template', 'programme_template', 'project_template'
    ) THEN
        RAISE EXCEPTION 'Unsupported domain: %', p_domain;
    END IF;

    v_methodology := NULLIF(lower(trim(COALESCE(p_methodology, ''))), '');
    IF v_methodology IS NOT NULL AND v_methodology NOT IN ('pmbok', 'structured', 'agile') THEN
        RAISE EXCEPTION 'Invalid methodology: %', p_methodology;
    END IF;

    IF p_domain = 'fields' THEN
        v_payload := COALESCE(p_payload, '[]'::jsonb);
        IF jsonb_typeof(v_payload) <> 'array' THEN
            RAISE EXCEPTION 'fields payload must be a JSON array';
        END IF;
    ELSIF p_domain = 'industry_plan' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'industry_plan payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'industry_code', '')), '') IS NULL THEN
            RAISE EXCEPTION 'industry_plan payload.industry_code is required';
        END IF;
    ELSIF p_domain = 'legacy_document' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'legacy_document payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'storage_path', '')), '') IS NULL THEN
            RAISE EXCEPTION 'legacy_document payload.storage_path is required';
        END IF;
    ELSIF p_domain = 'structured_list' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'structured_list payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'list_type', '')), '') IS NULL THEN
            RAISE EXCEPTION 'structured_list payload.list_type is required';
        END IF;
    ELSIF p_domain IN ('portfolio_template', 'programme_template', 'project_template') THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION '% payload must be a JSON object', p_domain;
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'template_code', '')), '') IS NULL THEN
            RAISE EXCEPTION '% payload.template_code is required', p_domain;
        END IF;
    ELSIF p_domain = 'form_template' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'form_template payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'template_code', '')), '') IS NULL THEN
            RAISE EXCEPTION 'form_template payload.template_code is required';
        END IF;
    ELSIF p_domain = 'opa' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'opa payload must be a JSON object';
        END IF;
    ELSIF p_domain = 'process_template' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'process_template payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'document_type', '')), '') IS NULL THEN
            RAISE EXCEPTION 'process_template payload.document_type is required';
        END IF;
    ELSE
        v_payload := COALESCE(p_payload, '{}'::jsonb);
    END IF;

    INSERT INTO admin.global_template_library (
        domain, name, description, category, methodology, payload,
        record_status, record_version, created_by, updated_by
    ) VALUES (
        p_domain,
        trim(p_name),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        NULLIF(trim(COALESCE(p_category, '')), ''),
        v_methodology,
        v_payload,
        'live',
        1,
        v_admin,
        v_admin
    )
    RETURNING id INTO v_id;

    UPDATE admin.global_template_library
    SET root_record_id = v_id
    WHERE id = v_id AND root_record_id IS NULL;

    INSERT INTO admin.global_template_versions (
        template_id, version_number, snapshot, change_description, changed_by
    ) VALUES (
        v_id, 1,
        jsonb_build_object(
            'domain', p_domain,
            'name', trim(p_name),
            'description', p_description,
            'category', p_category,
            'methodology', v_methodology,
            'payload', v_payload
        ),
        'Created',
        v_admin
    );

    PERFORM admin.log_admin_action(
        v_admin, 'global_template.create', 'global_template_library', v_id,
        jsonb_build_object('name', trim(p_name), 'domain', p_domain, 'methodology', v_methodology)
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_global_template(
    p_template_id UUID,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL,
    p_methodology TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_row admin.global_template_library%ROWTYPE;
    v_next_ver INTEGER;
    v_payload JSONB;
    v_methodology TEXT;
    v_patch_methodology BOOLEAN := (p_methodology IS NOT NULL);
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.edit required';
    END IF;

    SELECT * INTO v_row FROM admin.global_template_library WHERE id = p_template_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Global template not found';
    END IF;
    IF v_row.record_status = 'unauthorised' THEN
        RAISE EXCEPTION 'Record is locked pending approval';
    END IF;
    IF v_row.record_status = 'archived' THEN
        RAISE EXCEPTION 'Archived templates cannot be edited';
    END IF;
    IF v_row.domain NOT IN (
        'fields', 'industry_plan', 'legacy_document', 'structured_list',
            'form_template', 'opa', 'process_template',
            'portfolio_template', 'programme_template', 'project_template'
    ) THEN
        RAISE EXCEPTION 'Unsupported domain for update: %', v_row.domain;
    END IF;

    -- Empty string clears methodology; NULL leaves it unchanged (JS sends '' to clear)
    IF v_patch_methodology THEN
        v_methodology := NULLIF(lower(trim(p_methodology)), '');
        IF v_methodology IS NOT NULL AND v_methodology NOT IN ('pmbok', 'structured', 'agile') THEN
            RAISE EXCEPTION 'Invalid methodology: %', p_methodology;
        END IF;
    ELSE
        v_methodology := v_row.methodology;
    END IF;

    IF p_payload IS NOT NULL THEN
        IF v_row.domain = 'fields' AND jsonb_typeof(p_payload) <> 'array' THEN
            RAISE EXCEPTION 'fields payload must be a JSON array';
        END IF;
        IF v_row.domain IN (
            'industry_plan', 'legacy_document', 'structured_list',
            'form_template', 'opa', 'process_template',
            'portfolio_template', 'programme_template', 'project_template'
        ) AND jsonb_typeof(p_payload) <> 'object' THEN
            RAISE EXCEPTION '% payload must be a JSON object', v_row.domain;
        END IF;
        v_payload := p_payload;
    ELSE
        v_payload := v_row.payload;
    END IF;

    v_next_ver := COALESCE(v_row.record_version, 1) + 1;

    UPDATE admin.global_template_library SET
        name = COALESCE(NULLIF(trim(COALESCE(p_name, '')), ''), name),
        description = CASE WHEN p_description IS NULL THEN description
                           ELSE NULLIF(trim(p_description), '') END,
        category = CASE WHEN p_category IS NULL THEN category
                        ELSE NULLIF(trim(p_category), '') END,
        methodology = CASE WHEN v_patch_methodology THEN v_methodology ELSE methodology END,
        payload = v_payload,
        record_version = v_next_ver,
        updated_by = v_admin,
        updated_at = NOW()
    WHERE id = p_template_id;

    INSERT INTO admin.global_template_versions (
        template_id, version_number, snapshot, change_description, changed_by
    ) VALUES (
        p_template_id, v_next_ver,
        jsonb_build_object(
            'domain', v_row.domain,
            'name', COALESCE(NULLIF(trim(COALESCE(p_name, '')), ''), v_row.name),
            'description', COALESCE(p_description, v_row.description),
            'category', COALESCE(p_category, v_row.category),
            'methodology', CASE WHEN v_patch_methodology THEN v_methodology ELSE v_row.methodology END,
            'payload', v_payload
        ),
        'Updated',
        v_admin
    );

    PERFORM admin.log_admin_action(
        v_admin, 'global_template.update', 'global_template_library', p_template_id,
        jsonb_build_object('version', v_next_ver)
    );

    RETURN p_template_id;
END;
$$;

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
            'form_template', 'opa', 'process_template',
            'portfolio_template', 'programme_template', 'project_template'
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
        v_row.methodology,
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
        'methodology', v_row.methodology,
        'target', v_target,
        'sync', v_sync
    );
END;
$$;

-- Drop prior create/update overloads without methodology so callers resolve cleanly
DROP FUNCTION IF EXISTS admin.create_global_template(TEXT, TEXT, TEXT, TEXT, JSONB, UUID);
DROP FUNCTION IF EXISTS admin.update_global_template(UUID, TEXT, TEXT, TEXT, JSONB, UUID);

GRANT EXECUTE ON FUNCTION admin.create_global_template(TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_global_template(UUID, TEXT, TEXT, TEXT, JSONB, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.publish_global_template(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'v185_project_template_domain_methodology.sql applied';
END $$;
