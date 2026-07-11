-- ============================================================================
-- v123: Record pending changes infrastructure (defer-apply)
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v18.0_record_lifecycle_defer_apply_plan.md
-- Prerequisites: v95_record_lifecycle_infrastructure.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin.record_pending_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    root_record_id UUID NOT NULL,
    submission_batch_id UUID NOT NULL,
    previous_status TEXT NOT NULL,
    proposed_changes JSONB NOT NULL,
    submitted_by UUID REFERENCES admin.admin_users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_record_pending_changes UNIQUE (table_name, record_id)
);

CREATE INDEX IF NOT EXISTS idx_record_pending_changes_record
    ON admin.record_pending_changes (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_record_pending_changes_batch
    ON admin.record_pending_changes (submission_batch_id);

ALTER TABLE admin.record_pending_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_pending_changes_select ON admin.record_pending_changes;
CREATE POLICY policy_pending_changes_select ON admin.record_pending_changes
    FOR SELECT TO authenticated
    USING (
        admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.configure')
        OR admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.view_all')
        OR admin.check_admin_permission(admin.current_admin_user_id(), 'lifecycle.authorise')
        OR submitted_by = admin.current_admin_user_id()
        OR EXISTS (
            SELECT 1
            FROM admin.record_authorisers ra
            WHERE ra.table_name = admin.record_pending_changes.table_name
              AND ra.authoriser_admin_user_id = admin.current_admin_user_id()
              AND ra.is_active = TRUE
        )
    );

GRANT SELECT ON admin.record_pending_changes TO authenticated, service_role;
