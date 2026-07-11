-- ============================================================================
-- v84: Documentation system infrastructure
-- Plan: projectplans/v12.0_docs_and_testing_centre_plan.md (Phase 1)
-- Run: pnpm run admin:migrate-documentation
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    (
        'documentation',
        'documentation',
        TRUE,
        5242880,
        ARRAY['text/markdown', 'text/plain', 'application/octet-stream']
    ),
    (
        'testing-evidence',
        'testing-evidence',
        FALSE,
        52428800,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/zip', 'video/mp4']
    )
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read for documentation bucket
DROP POLICY IF EXISTS documentation_public_read ON storage.objects;
CREATE POLICY documentation_public_read ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'documentation');

DROP POLICY IF EXISTS documentation_admin_write ON storage.objects;
CREATE POLICY documentation_admin_write ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'documentation'
        AND admin.is_active_admin()
        AND admin.check_admin_permission(admin.current_admin_user_id(), 'docs.manage')
    )
    WITH CHECK (
        bucket_id = 'documentation'
        AND admin.is_active_admin()
        AND admin.check_admin_permission(admin.current_admin_user_id(), 'docs.manage')
    );

DROP POLICY IF EXISTS testing_evidence_admin ON storage.objects;
CREATE POLICY testing_evidence_admin ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'testing-evidence'
        AND admin.is_active_admin()
    )
    WITH CHECK (
        bucket_id = 'testing-evidence'
        AND admin.is_active_admin()
    );

-- ---------------------------------------------------------------------------
-- admin.documentation_guides
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.documentation_guides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    category TEXT,
    module TEXT NOT NULL,
    description TEXT,
    target_roles TEXT[],
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentation_guides_module
    ON admin.documentation_guides (module, sort_order)
    WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_documentation_guides_updated_at ON admin.documentation_guides;
CREATE TRIGGER trg_documentation_guides_updated_at
    BEFORE UPDATE ON admin.documentation_guides
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

ALTER TABLE admin.documentation_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documentation_guides_select ON admin.documentation_guides;
CREATE POLICY documentation_guides_select ON admin.documentation_guides
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.documentation_guides TO authenticated;
GRANT ALL ON admin.documentation_guides TO service_role;

-- ---------------------------------------------------------------------------
-- admin.upsert_documentation_guide
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.upsert_documentation_guide(
    p_guide_id TEXT,
    p_title TEXT,
    p_file_name TEXT,
    p_module TEXT,
    p_category TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_target_roles TEXT[] DEFAULT NULL,
    p_sort_order INTEGER DEFAULT 0,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_id UUID;
    v_prev JSONB;
    v_new JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'docs.manage') THEN
        RAISE EXCEPTION 'Permission denied: docs.manage required';
    END IF;

    SELECT to_jsonb(dg.*) INTO v_prev
    FROM admin.documentation_guides dg
    WHERE dg.guide_id = p_guide_id;

    INSERT INTO admin.documentation_guides (
        guide_id, title, file_name, module, category, description, target_roles, sort_order, is_active
    )
    VALUES (
        lower(trim(p_guide_id)),
        trim(p_title),
        trim(p_file_name),
        trim(p_module),
        NULLIF(trim(COALESCE(p_category, '')), ''),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        p_target_roles,
        COALESCE(p_sort_order, 0),
        TRUE
    )
    ON CONFLICT (guide_id) DO UPDATE SET
        title = EXCLUDED.title,
        file_name = EXCLUDED.file_name,
        module = EXCLUDED.module,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        target_roles = EXCLUDED.target_roles,
        sort_order = EXCLUDED.sort_order,
        is_active = TRUE,
        updated_at = NOW()
    RETURNING id INTO v_id;

    SELECT to_jsonb(dg.*) INTO v_new FROM admin.documentation_guides dg WHERE dg.id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'documentation.upsert',
        'documentation_guide',
        v_id,
        jsonb_build_object('guide_id', p_guide_id, 'module', p_module),
        v_prev,
        v_new
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.deactivate_documentation_guide
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.deactivate_documentation_guide(
    p_guide_id TEXT,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.documentation_guides%ROWTYPE;
    v_new admin.documentation_guides%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'docs.manage') THEN
        RAISE EXCEPTION 'Permission denied: docs.manage required';
    END IF;

    SELECT * INTO v_prev FROM admin.documentation_guides WHERE guide_id = p_guide_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Guide not found: %', p_guide_id; END IF;

    UPDATE admin.documentation_guides
    SET is_active = FALSE, updated_at = NOW()
    WHERE guide_id = p_guide_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'documentation.deactivate',
        'documentation_guide',
        v_new.id,
        jsonb_build_object('guide_id', p_guide_id),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('docs.view', 'View Documentation', 'documentation', 'Browse admin documentation guides'),
    ('docs.manage', 'Manage Documentation', 'documentation', 'Create and edit documentation guides and Storage files')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('super_admin', 'docs.view'),
    ('super_admin', 'docs.manage'),
    ('system_admin', 'docs.view'),
    ('system_admin', 'docs.manage'),
    ('content_admin', 'docs.view'),
    ('content_admin', 'docs.manage'),
    ('support_admin', 'docs.view')
ON CONFLICT (role, permission_key) DO NOTHING;

GRANT EXECUTE ON FUNCTION admin.upsert_documentation_guide(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.deactivate_documentation_guide(TEXT, UUID) TO authenticated, service_role;
