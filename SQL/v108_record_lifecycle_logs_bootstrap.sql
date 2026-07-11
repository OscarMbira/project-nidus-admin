-- ============================================================================
-- v108: Record lifecycle logs bootstrap (read access for history pages)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v51 (admin schema), v01 (admin_users)
-- Use when v95 was not applied but subscription history pages need the table.
-- Full lifecycle (RPCs, triggers, authorisation): pnpm run admin:migrate-record-lifecycle
-- Idempotent: safe to re-run.
-- ============================================================================

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

ALTER TABLE admin.record_lifecycle_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_lifecycle_logs_select ON admin.record_lifecycle_logs;
CREATE POLICY policy_lifecycle_logs_select ON admin.record_lifecycle_logs
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS policy_lifecycle_logs_insert ON admin.record_lifecycle_logs;
CREATE POLICY policy_lifecycle_logs_insert ON admin.record_lifecycle_logs
    FOR INSERT TO authenticated
    WITH CHECK (admin.is_active_admin());

GRANT SELECT, INSERT ON admin.record_lifecycle_logs TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v108: record_lifecycle_logs ready (history pages can query this table).';
    RAISE NOTICE 'v108: For full lifecycle governance, also run admin:migrate-record-lifecycle (v95–v99).';
END $$;
