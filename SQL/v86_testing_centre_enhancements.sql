-- ============================================================================
-- v86: Testing Centre enhancements
-- Plan: projectplans/v12.0_docs_and_testing_centre_plan.md (Phase 1)
-- Prerequisites: v36_test_management.sql, v84_documentation_infrastructure.sql
-- Run: pnpm run admin:migrate-testing-centre
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Link bugs to test runs
-- ---------------------------------------------------------------------------
ALTER TABLE public.bugs
    ADD COLUMN IF NOT EXISTS linked_test_run_id UUID,
    ADD COLUMN IF NOT EXISTS linked_test_case_id UUID,
    ADD COLUMN IF NOT EXISTS linked_test_result_id UUID;

CREATE INDEX IF NOT EXISTS idx_bugs_linked_test_run
    ON public.bugs (linked_test_run_id)
    WHERE linked_test_run_id IS NOT NULL AND COALESCE(is_deleted, FALSE) = FALSE;

-- ---------------------------------------------------------------------------
-- admin.tc_evidence_files
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.tc_evidence_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID REFERENCES admin.test_runs(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES admin.test_cases(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'screenshot'
        CHECK (file_type IN ('screenshot', 'log', 'video', 'attachment')),
    label TEXT DEFAULT 'actual'
        CHECK (label IS NULL OR label IN ('baseline', 'actual', 'failure', 'before_fix', 'after_fix')),
    note TEXT,
    uploaded_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tc_evidence_run ON admin.tc_evidence_files (test_run_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- admin.tc_diagnostic_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.tc_diagnostic_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_name TEXT NOT NULL,
    checks_run JSONB NOT NULL DEFAULT '[]'::jsonb,
    overall_status TEXT NOT NULL DEFAULT 'pass'
        CHECK (overall_status IN ('pass', 'warn', 'fail')),
    triggered_by UUID REFERENCES admin.admin_users(id),
    environment TEXT NOT NULL DEFAULT 'local'
        CHECK (environment IN ('local', 'staging', 'production')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tc_diagnostic_sessions_created
    ON admin.tc_diagnostic_sessions (created_at DESC);

-- ---------------------------------------------------------------------------
-- admin.tc_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.tc_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type TEXT NOT NULL DEFAULT 'text'
        CHECK (setting_type IN ('integer', 'boolean', 'text')),
    description TEXT,
    updated_by UUID REFERENCES admin.admin_users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_tc_settings_updated_at ON admin.tc_settings;
CREATE TRIGGER trg_tc_settings_updated_at
    BEFORE UPDATE ON admin.tc_settings
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE admin.tc_evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.tc_diagnostic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.tc_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tc_evidence_select ON admin.tc_evidence_files;
CREATE POLICY tc_evidence_select ON admin.tc_evidence_files
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS tc_diagnostic_select ON admin.tc_diagnostic_sessions;
CREATE POLICY tc_diagnostic_select ON admin.tc_diagnostic_sessions
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS tc_settings_select ON admin.tc_settings;
CREATE POLICY tc_settings_select ON admin.tc_settings
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.tc_evidence_files TO authenticated;
GRANT SELECT ON admin.tc_diagnostic_sessions TO authenticated;
GRANT SELECT ON admin.tc_settings TO authenticated;
GRANT ALL ON admin.tc_evidence_files TO service_role;
GRANT ALL ON admin.tc_diagnostic_sessions TO service_role;
GRANT ALL ON admin.tc_settings TO service_role;

-- ---------------------------------------------------------------------------
-- admin.create_tc_evidence_record
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_tc_evidence_record(
    p_test_run_id UUID,
    p_test_case_id UUID,
    p_file_name TEXT,
    p_file_path TEXT,
    p_file_type TEXT DEFAULT 'screenshot',
    p_label TEXT DEFAULT 'actual',
    p_note TEXT DEFAULT NULL,
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
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testing.evidence') THEN
        RAISE EXCEPTION 'Permission denied: testing.evidence required';
    END IF;

    INSERT INTO admin.tc_evidence_files (
        test_run_id, test_case_id, file_name, file_path, file_type, label, note, uploaded_by
    )
    VALUES (
        p_test_run_id, p_test_case_id, p_file_name, p_file_path,
        COALESCE(p_file_type, 'screenshot'), COALESCE(p_label, 'actual'),
        NULLIF(trim(COALESCE(p_note, '')), ''), v_admin_user_id
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.save_diagnostic_session
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.save_diagnostic_session(
    p_session_name TEXT,
    p_checks_run JSONB,
    p_overall_status TEXT,
    p_environment TEXT DEFAULT 'local',
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
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testing.diagnostics') THEN
        RAISE EXCEPTION 'Permission denied: testing.diagnostics required';
    END IF;

    INSERT INTO admin.tc_diagnostic_sessions (
        session_name, checks_run, overall_status, triggered_by, environment, completed_at
    )
    VALUES (
        trim(p_session_name),
        COALESCE(p_checks_run, '[]'::jsonb),
        COALESCE(p_overall_status, 'pass'),
        v_admin_user_id,
        COALESCE(p_environment, 'local'),
        NOW()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.upsert_tc_setting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.upsert_tc_setting(
    p_setting_key TEXT,
    p_setting_value TEXT,
    p_setting_type TEXT DEFAULT 'text',
    p_description TEXT DEFAULT NULL,
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
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testing.settings') THEN
        RAISE EXCEPTION 'Permission denied: testing.settings required';
    END IF;

    INSERT INTO admin.tc_settings (setting_key, setting_value, setting_type, description, updated_by)
    VALUES (
        trim(p_setting_key),
        p_setting_value,
        COALESCE(p_setting_type, 'text'),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        v_admin_user_id
    )
    ON CONFLICT (setting_key) DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        setting_type = EXCLUDED.setting_type,
        description = COALESCE(EXCLUDED.description, admin.tc_settings.description),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.log_test_defect
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.log_test_defect(
    p_title TEXT,
    p_description TEXT,
    p_test_run_id UUID,
    p_test_case_id UUID DEFAULT NULL,
    p_test_result_id UUID DEFAULT NULL,
    p_severity TEXT DEFAULT 'medium',
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_reporter_id UUID;
    v_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testing.manage') THEN
        RAISE EXCEPTION 'Permission denied: testing.manage required';
    END IF;

    v_reporter_id := admin.resolve_platform_user_for_admin(v_admin_user_id);

    INSERT INTO public.bugs (
        title, description, severity, status, reporter_id, created_by,
        linked_test_run_id, linked_test_case_id, linked_test_result_id
    )
    VALUES (
        trim(p_title),
        COALESCE(p_description, ''),
        COALESCE(p_severity, 'medium'),
        'new',
        v_reporter_id,
        v_reporter_id,
        p_test_run_id,
        p_test_case_id,
        p_test_result_id
    )
    RETURNING id INTO v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'testing.defect.log',
        'bug',
        v_id,
        jsonb_build_object('test_run_id', p_test_run_id),
        NULL,
        jsonb_build_object('title', p_title)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions (extend v36 testing.*)
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('testing.run', 'Trigger Test Runs', 'testing', 'Trigger and manage test run execution'),
    ('testing.evidence', 'Manage Evidence', 'testing', 'Upload and manage test evidence files'),
    ('testing.diagnostics', 'Run Diagnostics', 'testing', 'Run diagnostic health checks'),
    ('testing.settings', 'Manage Testing Settings', 'testing', 'Configure testing centre settings')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key FROM admin.admin_permissions
WHERE permission_key IN ('testing.run', 'testing.evidence', 'testing.diagnostics', 'testing.settings')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'testing.run'),
    ('system_admin', 'testing.evidence'),
    ('system_admin', 'testing.diagnostics'),
    ('system_admin', 'testing.settings'),
    ('support_admin', 'testing.view')
ON CONFLICT (role, permission_key) DO NOTHING;

GRANT EXECUTE ON FUNCTION admin.create_tc_evidence_record(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.save_diagnostic_session(TEXT, JSONB, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_tc_setting(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.log_test_defect(TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID) TO authenticated, service_role;
