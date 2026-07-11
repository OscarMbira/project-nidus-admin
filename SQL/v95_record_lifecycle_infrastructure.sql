-- ============================================================================
-- v95: Record lifecycle infrastructure (admin schema)
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v15.0_record_lifecycle_management_plan.md
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.set_lifecycle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS admin.record_lifecycle_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL UNIQUE,
    approval_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    level_approval_mode TEXT NOT NULL DEFAULT 'any'
        CHECK (level_approval_mode IN ('any', 'all')),
    history_retention_days INTEGER
        CHECK (history_retention_days IS NULL OR history_retention_days > 0),
    auto_archive_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    archive_retention_years INTEGER
        CHECK (archive_retention_years IS NULL OR archive_retention_years > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    configured_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin.record_archive_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL UNIQUE,
    history_retention_days INTEGER
        CHECK (history_retention_days IS NULL OR history_retention_days > 0),
    auto_archive_enabled BOOLEAN,
    archive_retention_years INTEGER
        CHECK (archive_retention_years IS NULL OR archive_retention_years > 0),
    override_reason TEXT NOT NULL,
    regulatory_reference TEXT,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    configured_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin.record_authorisers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    authoriser_admin_user_id UUID NOT NULL REFERENCES admin.admin_users(id) ON DELETE CASCADE,
    approval_level INTEGER NOT NULL DEFAULT 1 CHECK (approval_level >= 1),
    role_label TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_record_authorisers UNIQUE (table_name, authoriser_admin_user_id)
);

CREATE INDEX IF NOT EXISTS idx_record_authorisers_table_level
    ON admin.record_authorisers (table_name, approval_level) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS admin.record_authorisation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    root_record_id UUID NOT NULL,
    record_id UUID NOT NULL,
    submission_batch_id UUID NOT NULL,
    submitted_by UUID REFERENCES admin.admin_users(id),
    authoriser_id UUID REFERENCES admin.admin_users(id),
    approval_level INTEGER NOT NULL DEFAULT 1,
    role_label TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('waiting', 'pending', 'approved', 'rejected', 'withdrawn')),
    submission_notes TEXT,
    decision_notes TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_requests_root ON admin.record_authorisation_requests (root_record_id);
CREATE INDEX IF NOT EXISTS idx_auth_requests_batch ON admin.record_authorisation_requests (submission_batch_id);
CREATE INDEX IF NOT EXISTS idx_auth_requests_pending ON admin.record_authorisation_requests (authoriser_id, status)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS admin.record_lifecycle_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    root_record_id UUID NOT NULL,
    record_id UUID NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    operation TEXT NOT NULL,
    performed_by UUID REFERENCES admin.admin_users(id),
    reason TEXT,
    version_number INTEGER,
    snapshot_data JSONB,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_root ON admin.record_lifecycle_logs (root_record_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_table ON admin.record_lifecycle_logs (table_name, root_record_id);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['record_lifecycle_config', 'record_archive_config', 'record_authorisers'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON admin.%I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON admin.%I FOR EACH ROW EXECUTE FUNCTION admin.set_lifecycle_updated_at()',
            t, t
        );
    END LOOP;
END $$;

ALTER TABLE admin.record_lifecycle_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.record_archive_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.record_authorisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.record_authorisation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.record_lifecycle_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_lifecycle_config ON admin.record_lifecycle_config;
CREATE POLICY policy_lifecycle_config ON admin.record_lifecycle_config
    FOR ALL TO authenticated
    USING (admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure'))
    WITH CHECK (admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure'));

DROP POLICY IF EXISTS policy_archive_config ON admin.record_archive_config;
CREATE POLICY policy_archive_config ON admin.record_archive_config
    FOR ALL TO authenticated
    USING (admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure'))
    WITH CHECK (admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure'));

DROP POLICY IF EXISTS policy_authorisers ON admin.record_authorisers;
CREATE POLICY policy_authorisers ON admin.record_authorisers
    FOR ALL TO authenticated
    USING (admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure'))
    WITH CHECK (admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure'));

DROP POLICY IF EXISTS policy_auth_requests_select ON admin.record_authorisation_requests;
CREATE POLICY policy_auth_requests_select ON admin.record_authorisation_requests
    FOR SELECT TO authenticated
    USING (
        admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure')
        OR admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.view_all')
        OR submitted_by = admin.current_admin_user_id()
        OR authoriser_id = admin.current_admin_user_id()
    );

DROP POLICY IF EXISTS policy_auth_requests_write ON admin.record_authorisation_requests;
CREATE POLICY policy_auth_requests_write ON admin.record_authorisation_requests
    FOR ALL TO authenticated
    USING (
        admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure')
        OR submitted_by = admin.current_admin_user_id()
        OR authoriser_id = admin.current_admin_user_id()
    )
    WITH CHECK (
        admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure')
        OR submitted_by = admin.current_admin_user_id()
        OR authoriser_id = admin.current_admin_user_id()
    );

DROP POLICY IF EXISTS policy_lifecycle_logs_select ON admin.record_lifecycle_logs;
CREATE POLICY policy_lifecycle_logs_select ON admin.record_lifecycle_logs
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS policy_lifecycle_logs_insert ON admin.record_lifecycle_logs;
CREATE POLICY policy_lifecycle_logs_insert ON admin.record_lifecycle_logs
    FOR INSERT TO authenticated
    WITH CHECK (admin.is_active_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON admin.record_lifecycle_config TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin.record_archive_config TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin.record_authorisers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin.record_authorisation_requests TO authenticated, service_role;
GRANT SELECT, INSERT ON admin.record_lifecycle_logs TO authenticated, service_role;
