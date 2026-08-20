-- =============================================================================
-- v161: Global Template Library — RLS + CRUD RPCs
-- Plan: projectplans/v159_global_template_library_plan.md
-- Prerequisites: v160
-- =============================================================================

ALTER TABLE admin.global_template_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.global_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gtl_select ON admin.global_template_library;
CREATE POLICY gtl_select ON admin.global_template_library
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admin.admin_users au
            WHERE au.auth_user_id = auth.uid()
              AND au.activation_status = 'active'
              AND au.role IN ('super_admin', 'system_admin', 'content_admin')
        )
    );

DROP POLICY IF EXISTS gtl_write ON admin.global_template_library;
CREATE POLICY gtl_write ON admin.global_template_library
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admin.admin_users au
            WHERE au.auth_user_id = auth.uid()
              AND au.activation_status = 'active'
              AND au.role IN ('super_admin', 'system_admin', 'content_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin.admin_users au
            WHERE au.auth_user_id = auth.uid()
              AND au.activation_status = 'active'
              AND au.role IN ('super_admin', 'system_admin', 'content_admin')
        )
    );

DROP POLICY IF EXISTS gtl_versions_select ON admin.global_template_versions;
CREATE POLICY gtl_versions_select ON admin.global_template_versions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admin.admin_users au
            WHERE au.auth_user_id = auth.uid()
              AND au.activation_status = 'active'
              AND au.role IN ('super_admin', 'system_admin', 'content_admin')
        )
    );

DROP POLICY IF EXISTS gtl_versions_insert ON admin.global_template_versions;
CREATE POLICY gtl_versions_insert ON admin.global_template_versions
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin.admin_users au
            WHERE au.auth_user_id = auth.uid()
              AND au.activation_status = 'active'
              AND au.role IN ('super_admin', 'system_admin', 'content_admin')
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON admin.global_template_library TO authenticated;
GRANT ALL ON admin.global_template_library TO service_role;
GRANT SELECT, INSERT ON admin.global_template_versions TO authenticated;
GRANT ALL ON admin.global_template_versions TO service_role;

-- ---------------------------------------------------------------------------
-- CRUD RPCs
-- ---------------------------------------------------------------------------
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
        'fields', 'form_template', 'industry_plan', 'opa', 'process_template'
    ) THEN
        RAISE EXCEPTION 'Invalid domain: %', p_domain;
    END IF;
    IF p_domain <> 'fields' THEN
        RAISE EXCEPTION 'Phase 1 only supports domain=fields';
    END IF;

    INSERT INTO admin.global_template_library (
        domain, name, description, category, payload,
        record_status, record_version, created_by, updated_by
    ) VALUES (
        p_domain,
        trim(p_name),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        NULLIF(trim(COALESCE(p_category, '')), ''),
        COALESCE(p_payload, '[]'::jsonb),
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
            'payload', COALESCE(p_payload, '[]'::jsonb)
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

    v_next_ver := COALESCE(v_row.record_version, 1) + 1;

    UPDATE admin.global_template_library SET
        name = COALESCE(NULLIF(trim(COALESCE(p_name, '')), ''), name),
        description = CASE WHEN p_description IS NULL THEN description
                           ELSE NULLIF(trim(p_description), '') END,
        category = CASE WHEN p_category IS NULL THEN category
                        ELSE NULLIF(trim(p_category), '') END,
        payload = COALESCE(p_payload, payload),
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
            'payload', COALESCE(p_payload, v_row.payload)
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

CREATE OR REPLACE FUNCTION admin.archive_global_template(
    p_template_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.edit required';
    END IF;

    UPDATE admin.global_template_library SET
        record_status = 'archived',
        archived_at = NOW(),
        archived_by = v_admin,
        updated_by = v_admin,
        updated_at = NOW()
    WHERE id = p_template_id
      AND record_status <> 'archived';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Global template not found or already archived';
    END IF;

    PERFORM admin.log_admin_action(
        v_admin, 'global_template.archive', 'global_template_library', p_template_id, '{}'::jsonb
    );
    RETURN p_template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.create_global_template(TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_global_template(UUID, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.archive_global_template(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v161_global_template_library_rls.sql applied';
END $$;
