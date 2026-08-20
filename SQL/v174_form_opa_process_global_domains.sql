-- =============================================================================
-- v174: Global Template Library — form_template + opa + process_template domains
-- Companion monorepo: SQL/v777_form_opa_process_global_template_sync.sql (apply first)
-- Plan: projectplans/v173_global_template_library_domain_coverage_plan.md Parts B/D
-- Note: Admin v173 already covered legacy_document/structured_list; this extends RPCs
-- Prerequisites: Admin v160–v173; monorepo v777
-- =============================================================================

ALTER TABLE admin.global_template_library
  DROP CONSTRAINT IF EXISTS chk_gtl_domain;

ALTER TABLE admin.global_template_library
  ADD CONSTRAINT chk_gtl_domain CHECK (
    domain IN (
      'fields', 'form_template', 'industry_plan', 'opa', 'process_template',
      'legacy_document', 'structured_list'
    )
  );

COMMENT ON COLUMN admin.global_template_library.payload IS
  'fields: JSON array. Other domains: JSON object (industry_plan, form_template, opa, process_template, legacy_document, structured_list).';

CREATE OR REPLACE FUNCTION admin.create_global_template(
    p_domain TEXT,
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT '[]'::jsonb,
    p_admin_user_id UUID DEFAULT NULL
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
        'form_template', 'opa', 'process_template'
    ) THEN
        RAISE EXCEPTION 'Unsupported domain: %', p_domain;
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
        domain, name, description, category, payload,
        record_status, record_version, created_by, updated_by
    ) VALUES (
        p_domain,
        trim(p_name),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        NULLIF(trim(COALESCE(p_category, '')), ''),
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
            'payload', v_payload
        ),
        'Created',
        v_admin
    );

    PERFORM admin.log_admin_action(
        v_admin, 'global_template.create', 'global_template_library', v_id,
        jsonb_build_object('name', trim(p_name), 'domain', p_domain)
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
    p_admin_user_id UUID DEFAULT NULL
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
        'form_template', 'opa', 'process_template'
    ) THEN
        RAISE EXCEPTION 'Unsupported domain for update: %', v_row.domain;
    END IF;

    IF p_payload IS NOT NULL THEN
        IF v_row.domain = 'fields' AND jsonb_typeof(p_payload) <> 'array' THEN
            RAISE EXCEPTION 'fields payload must be a JSON array';
        END IF;
        IF v_row.domain IN (
            'industry_plan', 'legacy_document', 'structured_list',
            'form_template', 'opa', 'process_template'
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
    p_notes TEXT DEFAULT NULL
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

    v_sync := public.sync_global_template_node(
        v_row.id,
        v_row.domain,
        v_row.name,
        v_row.description,
        v_row.category,
        GREATEST(COALESCE(v_row.record_version, 1), 1),
        v_row.payload
    );

    UPDATE admin.global_template_library
    SET synced_at = NOW(),
        synced_version = GREATEST(COALESCE(record_version, 1), 1),
        updated_at = NOW(),
        updated_by = v_admin
    WHERE id = p_template_id;

    PERFORM admin.log_admin_action(
        v_admin, 'global_template.publish', 'global_template_library', p_template_id,
        jsonb_build_object('notes', trim(p_notes), 'sync', v_sync)
    );

    RETURN jsonb_build_object(
        'template_id', p_template_id,
        'domain', v_row.domain,
        'sync', v_sync
    );
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'v174_form_opa_process_global_domains.sql applied';
END $$;
