-- ============================================================================
-- v73: Improvement backlog table + admin console read RLS
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735 admin schema, public.users
-- Run: pnpm run admin:migrate-improvement-backlog
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.improvement_backlog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    improvement_type VARCHAR(50) DEFAULT 'enhancement'
        CHECK (improvement_type IN (
            'bug_fix', 'performance', 'ux', 'feature_polish',
            'documentation', 'accessibility', 'mobile', 'enhancement'
        )),
    impact_score INTEGER DEFAULT 0 CHECK (impact_score >= 0 AND impact_score <= 100),
    effort_score INTEGER DEFAULT 0 CHECK (effort_score >= 0 AND effort_score <= 100),
    priority_score DECIMAL(10, 2) GENERATED ALWAYS AS (
        CASE
            WHEN effort_score = 0 THEN 0
            ELSE ROUND(impact_score::DECIMAL / effort_score::DECIMAL * 100, 2)
        END
    ) STORED,
    status VARCHAR(20) DEFAULT 'backlog'
        CHECK (status IN ('backlog', 'planned', 'in_progress', 'testing', 'completed', 'cancelled')),
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    source_type VARCHAR(50),
    source_id UUID,
    related_feedback_id UUID,
    related_bug_id UUID,
    related_feature_request_id UUID,
    planned_release VARCHAR(100),
    target_completion_date DATE,
    improvement_notes TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_improvement_backlog_status ON public.improvement_backlog(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_improvement_backlog_priority_score ON public.improvement_backlog(priority_score DESC) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_improvement_backlog_created_at ON public.improvement_backlog(created_at DESC) WHERE is_deleted = FALSE;

ALTER TABLE public.improvement_backlog ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION admin.can_view_improvement_backlog()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'feedback.backlog.view'
       );
$$;

COMMENT ON FUNCTION admin.can_view_improvement_backlog() IS
    'TRUE when the authenticated session is an active admin with feedback.backlog.view';

GRANT EXECUTE ON FUNCTION admin.can_view_improvement_backlog() TO authenticated, service_role;

DROP POLICY IF EXISTS policy_improvement_backlog_admin_console_select ON public.improvement_backlog;
CREATE POLICY policy_improvement_backlog_admin_console_select
    ON public.improvement_backlog
    FOR SELECT
    TO authenticated
    USING (
        admin.can_view_improvement_backlog()
        AND COALESCE(is_deleted, FALSE) = FALSE
    );

GRANT SELECT ON public.improvement_backlog TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'v73: improvement_backlog table and admin read RLS applied.';
END $$;
