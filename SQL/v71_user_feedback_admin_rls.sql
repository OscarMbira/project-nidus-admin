-- ============================================================================
-- v71: User feedback table + admin console read RLS (Feedback Analysis)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735 admin schema, public.users
-- Run: pnpm run admin:migrate-user-feedback
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    feedback_type VARCHAR(50) NOT NULL,
    feedback_text TEXT NOT NULL,
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    page_url TEXT,
    user_agent TEXT,
    browser_info JSONB DEFAULT '{}'::jsonb,
    screenshot_data TEXT,
    status VARCHAR(50) DEFAULT 'new'
        CHECK (status IN ('new', 'reviewing', 'acknowledged', 'resolved', 'closed')),
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON public.user_feedback(feedback_type) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON public.user_feedback(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_feedback_rating ON public.user_feedback(rating) WHERE is_deleted = FALSE AND rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON public.user_feedback(created_at DESC) WHERE is_deleted = FALSE;

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION admin.can_view_feedback_analysis()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'feedback.analysis.view'
       );
$$;

COMMENT ON FUNCTION admin.can_view_feedback_analysis() IS
    'TRUE when the authenticated session is an active admin with feedback.analysis.view';

GRANT EXECUTE ON FUNCTION admin.can_view_feedback_analysis() TO authenticated, service_role;

DROP POLICY IF EXISTS policy_user_feedback_admin_console_select ON public.user_feedback;
CREATE POLICY policy_user_feedback_admin_console_select
    ON public.user_feedback
    FOR SELECT
    TO authenticated
    USING (
        admin.can_view_feedback_analysis()
        AND COALESCE(is_deleted, FALSE) = FALSE
    );

GRANT SELECT ON public.user_feedback TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'v71: user_feedback table and admin read RLS applied.';
END $$;
