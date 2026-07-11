-- ============================================================================
-- v69: Bug report management RPCs for admin console
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v67_feedback_tables_admin_rls.sql
-- Run: pnpm run admin:migrate-feedback-bugs
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.can_manage_bug_reports()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'feedback.bugs.manage'
       );
$$;

COMMENT ON FUNCTION admin.can_manage_bug_reports() IS
    'TRUE when the authenticated session is an active admin with feedback.bugs.manage';

GRANT EXECUTE ON FUNCTION admin.can_manage_bug_reports() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION admin.resolve_platform_user_for_admin(p_admin_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT u.id
    FROM admin.admin_users au
    INNER JOIN public.users u ON u.auth_user_id = au.auth_user_id
    WHERE au.id = p_admin_user_id
      AND COALESCE(u.is_deleted, FALSE) = FALSE
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION admin.resolve_platform_user_for_admin(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin.update_bug_report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_bug_report(
    p_bug_id UUID,
    p_updates JSONB,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
    v_new_status TEXT;
    v_new_priority TEXT;
    v_new_severity TEXT;
    v_assignee_user_id UUID;
    v_platform_user_id UUID;
    v_resolution_notes TEXT;
    v_related_project_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'feedback.bugs.manage') THEN
        RAISE EXCEPTION 'Permission denied: feedback.bugs.manage required';
    END IF;

    IF p_updates IS NULL OR p_updates = '{}'::JSONB THEN
        RAISE EXCEPTION 'updates payload cannot be empty';
    END IF;

    SELECT to_jsonb(b.*)
    INTO v_prev
    FROM public.bugs b
    WHERE b.id = p_bug_id
      AND COALESCE(b.is_deleted, FALSE) = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bug report not found: %', p_bug_id;
    END IF;

    v_new_status := p_updates ->> 'status';
    v_new_priority := p_updates ->> 'priority';
    v_new_severity := p_updates ->> 'severity';
    v_resolution_notes := NULLIF(trim(p_updates ->> 'resolution_notes'), '');
    v_related_project_id := NULLIF(p_updates ->> 'related_project_id', '')::UUID;

    IF v_new_status IS NOT NULL AND v_new_status NOT IN (
        'new', 'assigned', 'in_progress', 'fixed', 'verified', 'closed', 'rejected'
    ) THEN
        RAISE EXCEPTION 'Invalid bug status: %', v_new_status;
    END IF;

    IF v_new_priority IS NOT NULL AND v_new_priority NOT IN ('p0', 'p1', 'p2', 'p3') THEN
        RAISE EXCEPTION 'Invalid bug priority: %', v_new_priority;
    END IF;

    IF v_new_severity IS NOT NULL AND v_new_severity NOT IN ('critical', 'high', 'medium', 'low') THEN
        RAISE EXCEPTION 'Invalid bug severity: %', v_new_severity;
    END IF;

    v_assignee_user_id := NULL;
    IF p_updates ? 'assignee_user_id' THEN
        v_assignee_user_id := NULLIF(p_updates ->> 'assignee_user_id', '')::UUID;
    ELSIF p_updates ? 'assignee_admin_user_id' THEN
        v_assignee_user_id := admin.resolve_platform_user_for_admin(
            NULLIF(p_updates ->> 'assignee_admin_user_id', '')::UUID
        );
    END IF;

    v_platform_user_id := admin.resolve_platform_user_for_admin(v_admin_user_id);

    UPDATE public.bugs
    SET status = COALESCE(v_new_status, status),
        priority = COALESCE(v_new_priority, priority),
        severity = COALESCE(v_new_severity, severity),
        assignee_id = CASE
            WHEN p_updates ? 'assignee_user_id' OR p_updates ? 'assignee_admin_user_id'
                THEN v_assignee_user_id
            ELSE assignee_id
        END,
        resolution_notes = COALESCE(v_resolution_notes, resolution_notes),
        related_project_id = COALESCE(v_related_project_id, related_project_id),
        resolved_at = CASE
            WHEN v_new_status IN ('fixed', 'verified', 'closed')
                THEN COALESCE(resolved_at, NOW())
            WHEN v_new_status IN ('new', 'assigned', 'in_progress', 'rejected')
                THEN NULL
            ELSE resolved_at
        END,
        resolved_by = CASE
            WHEN v_new_status IN ('fixed', 'verified', 'closed')
                THEN COALESCE(resolved_by, v_platform_user_id)
            WHEN v_new_status IN ('new', 'assigned', 'in_progress', 'rejected')
                THEN NULL
            ELSE resolved_by
        END,
        updated_by = v_platform_user_id,
        updated_at = NOW()
    WHERE id = p_bug_id
      AND COALESCE(is_deleted, FALSE) = FALSE;

    IF v_new_status IS NULL
       AND (p_updates ? 'assignee_user_id' OR p_updates ? 'assignee_admin_user_id')
       AND (v_prev ->> 'status') = 'new' THEN
        UPDATE public.bugs
        SET status = 'assigned'
        WHERE id = p_bug_id;
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'feedback.bugs.manage',
        'bug_report',
        p_bug_id,
        NULL,
        v_prev,
        p_updates
    );

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION admin.update_bug_report(UUID, JSONB, UUID) IS
    'Admin triage update for a platform bug report (status, priority, severity, assignee, resolution).';

-- ---------------------------------------------------------------------------
-- admin.reject_bug_report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.reject_bug_report(
    p_bug_id UUID,
    p_reason TEXT,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Rejection reason is required';
    END IF;

    RETURN admin.update_bug_report(
        p_bug_id,
        jsonb_build_object(
            'status', 'rejected',
            'resolution_notes', trim(p_reason)
        ),
        p_admin_user_id
    );
END;
$$;

COMMENT ON FUNCTION admin.reject_bug_report(UUID, TEXT, UUID) IS
    'Reject a bug report with a required reason.';

GRANT EXECUTE ON FUNCTION admin.update_bug_report(UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reject_bug_report(UUID, TEXT, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v69: Bug report management RPCs applied.';
END $$;
