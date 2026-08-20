-- =============================================================================
-- v166: Global Template Library — industry_plan domain authoring + publish
-- Plan: projectplans/v166_global_industry_template_authoring_plan.md
-- Companion monorepo: SQL/v773_global_industry_template_sync.sql (apply first)
-- Prerequisites: Admin v160–v165b; monorepo v773
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Payload may be array (fields) or object (industry_plan)
-- -----------------------------------------------------------------------------
ALTER TABLE admin.global_template_library
    DROP CONSTRAINT IF EXISTS chk_gtl_payload_array;

ALTER TABLE admin.global_template_library
    ADD CONSTRAINT chk_gtl_payload_array_or_object
    CHECK (jsonb_typeof(payload) IN ('array', 'object'));

COMMENT ON COLUMN admin.global_template_library.payload IS
    'domain=fields: JSON array of field rows. domain=industry_plan: JSON object with industry_code + child arrays.';

-- -----------------------------------------------------------------------------
-- 2) create / update — allow fields + industry_plan
-- -----------------------------------------------------------------------------
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
    IF p_domain IS NULL OR p_domain NOT IN ('fields', 'industry_plan') THEN
        RAISE EXCEPTION 'Supported domains: fields, industry_plan (got %)', p_domain;
    END IF;

    IF p_domain = 'fields' THEN
        v_payload := COALESCE(p_payload, '[]'::jsonb);
        IF jsonb_typeof(v_payload) <> 'array' THEN
            RAISE EXCEPTION 'fields payload must be a JSON array';
        END IF;
    ELSE
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'industry_plan payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'industry_code', '')), '') IS NULL THEN
            RAISE EXCEPTION 'industry_plan payload.industry_code is required';
        END IF;
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
    IF v_row.domain NOT IN ('fields', 'industry_plan') THEN
        RAISE EXCEPTION 'Unsupported domain for update: %', v_row.domain;
    END IF;

    IF p_payload IS NOT NULL THEN
        IF v_row.domain = 'fields' AND jsonb_typeof(p_payload) <> 'array' THEN
            RAISE EXCEPTION 'fields payload must be a JSON array';
        END IF;
        IF v_row.domain = 'industry_plan' THEN
            IF jsonb_typeof(p_payload) <> 'object' THEN
                RAISE EXCEPTION 'industry_plan payload must be a JSON object';
            END IF;
            IF NULLIF(trim(COALESCE(p_payload->>'industry_code', '')), '') IS NULL THEN
                RAISE EXCEPTION 'industry_plan payload.industry_code is required';
            END IF;
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

GRANT EXECUTE ON FUNCTION admin.create_global_template(TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_global_template(UUID, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Publish — fields OR industry_plan
-- -----------------------------------------------------------------------------
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
    v_payload JSONB;
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
    IF v_row.domain NOT IN ('fields', 'industry_plan') THEN
        RAISE EXCEPTION 'Publish supports domain=fields or industry_plan (got %)', v_row.domain;
    END IF;

    IF v_row.domain = 'industry_plan' THEN
        v_payload := COALESCE(v_row.payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'industry_plan payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'industry_code', '')), '') IS NULL THEN
            RAISE EXCEPTION 'industry_plan payload.industry_code is required';
        END IF;
    ELSE
        v_payload := COALESCE(v_row.payload, '[]'::jsonb);
    END IF;

    v_sync := public.sync_global_template_node(
        v_row.id,
        v_row.domain,
        v_row.name,
        v_row.description,
        v_row.category,
        COALESCE(v_row.record_version, 1),
        v_payload
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
        RAISE WARNING 'v166: public.sync_global_template_node missing — apply monorepo SQL/v773 before publishing industry_plan.';
    END IF;
    RAISE NOTICE 'v166_global_industry_template_domain.sql applied';
END $$;
