-- ============================================================================
-- v67: Feedback tables (bugs, feature_requests) + admin console read RLS
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735 admin schema, public.users
--
-- Problem: Admin feedback module queried public.bug_reports (does not exist).
-- Platform schema uses public.bugs (v60) and public.feature_requests (v62).
-- This migration ensures tables exist in dev DBs and grants admin-console read.
-- Run: pnpm run admin:migrate-feedback
-- ============================================================================

-- ---------------------------------------------------------------------------
-- public.bugs (platform v60 compatible subset)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bugs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    steps_to_reproduce TEXT,
    expected_behavior TEXT,
    actual_behavior TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium'
        CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    priority VARCHAR(10) NOT NULL DEFAULT 'p2'
        CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
    status VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'assigned', 'in_progress', 'fixed', 'verified', 'closed', 'rejected')),
    reporter_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    page_url VARCHAR(500),
    browser_info TEXT,
    device_info TEXT,
    screenshot_url TEXT,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    related_project_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bugs_status ON public.bugs(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_bugs_priority ON public.bugs(priority) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_bugs_created_at ON public.bugs(created_at DESC) WHERE is_deleted = FALSE;

-- ---------------------------------------------------------------------------
-- public.feature_requests (platform v62 compatible subset)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category VARCHAR(50) DEFAULT 'feature',
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'under_review'
        CHECK (status IN ('under_review', 'approved', 'in_progress', 'completed', 'declined')),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    vote_count INTEGER DEFAULT 0,
    upvote_count INTEGER DEFAULT 0,
    downvote_count INTEGER DEFAULT 0,
    implementation_notes TEXT,
    estimated_effort VARCHAR(50),
    estimated_completion_date DATE,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON public.feature_requests(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_feature_requests_vote_count ON public.feature_requests(vote_count DESC) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_feature_requests_created_at ON public.feature_requests(created_at DESC) WHERE is_deleted = FALSE;

ALTER TABLE public.bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Admin permission helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.can_view_bug_reports()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'feedback.bugs.view'
       );
$$;

CREATE OR REPLACE FUNCTION admin.can_view_feature_requests()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'feedback.requests.view'
       );
$$;

GRANT EXECUTE ON FUNCTION admin.can_view_bug_reports() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.can_view_feature_requests() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin console read policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS policy_bugs_admin_console_select ON public.bugs;
CREATE POLICY policy_bugs_admin_console_select
    ON public.bugs
    FOR SELECT
    TO authenticated
    USING (
        admin.can_view_bug_reports()
        AND COALESCE(is_deleted, FALSE) = FALSE
    );

DROP POLICY IF EXISTS policy_feature_requests_admin_console_select ON public.feature_requests;
CREATE POLICY policy_feature_requests_admin_console_select
    ON public.feature_requests
    FOR SELECT
    TO authenticated
    USING (
        admin.can_view_feature_requests()
        AND COALESCE(is_deleted, FALSE) = FALSE
    );

GRANT SELECT ON public.bugs TO authenticated;
GRANT SELECT ON public.feature_requests TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'v67: Feedback tables and admin read RLS applied.';
END $$;
