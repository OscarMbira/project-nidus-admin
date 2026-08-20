-- =============================================================================
-- v177: Admin wrappers — read completed form instances (Platform / Simulator)
-- Prerequisites: monorepo SQL/v779_admin_form_instance_read_access.sql
-- Plan: projectplans/v174_form_template_export_plain_completed_plan.md (Phase 2)
-- Resolves form_templates by template_code from global_template_library.payload
-- =============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    (
        'content.global_templates.export_completed',
        'Export Completed Form Data',
        'content',
        'Export real submitted form data from Platform/Simulator projects'
    )
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('super_admin', 'content.global_templates.export_completed'),
    ('system_admin', 'content.global_templates.export_completed'),
    ('content_admin', 'content.global_templates.export_completed')
ON CONFLICT (role, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION admin.list_completed_form_instances(
    p_global_template_id UUID,
    p_target TEXT,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    form_instance_id UUID,
    project_id UUID,
    project_name TEXT,
    status TEXT,
    owner_name TEXT,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_target TEXT := lower(trim(COALESCE(p_target, '')));
    v_code TEXT;
    v_domain TEXT;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.export_completed') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.export_completed required';
    END IF;
    IF v_target NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'Invalid target: % (use platform or simulator)', p_target;
    END IF;

    SELECT
        g.domain,
        NULLIF(trim(COALESCE(g.payload->>'template_code', '')), '')
    INTO v_domain, v_code
    FROM admin.global_template_library g
    WHERE g.id = p_global_template_id
      AND g.record_status <> 'history';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Global template not found: %', p_global_template_id;
    END IF;
    IF v_domain <> 'form_template' THEN
        RAISE EXCEPTION 'Export completed data is only supported for form_template domain (got %)', v_domain;
    END IF;
    IF v_code IS NULL THEN
        RAISE EXCEPTION 'Global template payload is missing template_code';
    END IF;

    IF v_target = 'platform' THEN
        RETURN QUERY
        SELECT * FROM public.list_form_instances_for_template(v_code);
    ELSE
        RETURN QUERY
        SELECT * FROM sim.list_form_instances_for_template(v_code);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin.get_completed_form_instance(
    p_form_instance_id UUID,
    p_target TEXT,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_target TEXT := lower(trim(COALESCE(p_target, '')));
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.export_completed') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.export_completed required';
    END IF;
    IF v_target NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'Invalid target: % (use platform or simulator)', p_target;
    END IF;
    IF p_form_instance_id IS NULL THEN
        RAISE EXCEPTION 'form_instance_id is required';
    END IF;

    IF v_target = 'platform' THEN
        RETURN public.get_form_instance_export_data(p_form_instance_id);
    END IF;
    RETURN sim.get_form_instance_export_data(p_form_instance_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin.list_completed_form_instances(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_completed_form_instance(UUID, TEXT, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v177_admin_form_instance_read_wrapper.sql applied';
END $$;
