-- ============================================================================
-- v70: Feature request management RPCs for admin console
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v67_feedback_tables_admin_rls.sql, v69 (resolve_platform_user_for_admin)
-- Run: pnpm run admin:migrate-feedback-features
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.can_manage_feature_requests()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'feedback.requests.manage'
       );
$$;

COMMENT ON FUNCTION admin.can_manage_feature_requests() IS
    'TRUE when the authenticated session is an active admin with feedback.requests.manage';

GRANT EXECUTE ON FUNCTION admin.can_manage_feature_requests() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin.update_feature_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_feature_request(
    p_request_id UUID,
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
    v_new_category TEXT;
    v_assignee_user_id UUID;
    v_platform_user_id UUID;
    v_implementation_notes TEXT;
    v_estimated_effort TEXT;
    v_estimated_completion DATE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'feedback.requests.manage') THEN
        RAISE EXCEPTION 'Permission denied: feedback.requests.manage required';
    END IF;

    IF p_updates IS NULL OR p_updates = '{}'::JSONB THEN
        RAISE EXCEPTION 'updates payload cannot be empty';
    END IF;

    SELECT to_jsonb(fr.*)
    INTO v_prev
    FROM public.feature_requests fr
    WHERE fr.id = p_request_id
      AND COALESCE(fr.is_deleted, FALSE) = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Feature request not found: %', p_request_id;
    END IF;

    v_new_status := p_updates ->> 'status';
    v_new_priority := p_updates ->> 'priority';
    v_new_category := p_updates ->> 'category';
    v_implementation_notes := NULLIF(trim(p_updates ->> 'implementation_notes'), '');
    v_estimated_effort := NULLIF(trim(p_updates ->> 'estimated_effort'), '');

    IF p_updates ? 'estimated_completion_date' THEN
        v_estimated_completion := NULLIF(p_updates ->> 'estimated_completion_date', '')::DATE;
    END IF;

    IF v_new_status IS NOT NULL AND v_new_status NOT IN (
        'under_review', 'approved', 'in_progress', 'completed', 'declined'
    ) THEN
        RAISE EXCEPTION 'Invalid feature request status: %', v_new_status;
    END IF;

    IF v_new_priority IS NOT NULL AND v_new_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
        RAISE EXCEPTION 'Invalid feature request priority: %', v_new_priority;
    END IF;

    IF v_new_category IS NOT NULL AND v_new_category NOT IN (
        'feature', 'enhancement', 'integration', 'ui', 'performance', 'other'
    ) THEN
        RAISE EXCEPTION 'Invalid feature request category: %', v_new_category;
    END IF;

    IF v_estimated_effort IS NOT NULL AND v_estimated_effort NOT IN ('small', 'medium', 'large', 'xlarge') THEN
        RAISE EXCEPTION 'Invalid estimated effort: %', v_estimated_effort;
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

    UPDATE public.feature_requests
    SET status = COALESCE(v_new_status, status),
        priority = COALESCE(v_new_priority, priority),
        category = COALESCE(v_new_category, category),
        assigned_to = CASE
            WHEN p_updates ? 'assignee_user_id' OR p_updates ? 'assignee_admin_user_id'
                THEN v_assignee_user_id
            ELSE assigned_to
        END,
        implementation_notes = COALESCE(v_implementation_notes, implementation_notes),
        estimated_effort = COALESCE(v_estimated_effort, estimated_effort),
        estimated_completion_date = COALESCE(v_estimated_completion, estimated_completion_date),
        updated_by = v_platform_user_id,
        updated_at = NOW()
    WHERE id = p_request_id
      AND COALESCE(is_deleted, FALSE) = FALSE;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'feedback.requests.manage',
        'feature_request',
        p_request_id,
        NULL,
        v_prev,
        p_updates
    );

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION admin.update_feature_request(UUID, JSONB, UUID) IS
    'Admin pipeline update for a platform feature request.';

-- ---------------------------------------------------------------------------
-- admin.decline_feature_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.decline_feature_request(
    p_request_id UUID,
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
        RAISE EXCEPTION 'Decline reason is required';
    END IF;

    RETURN admin.update_feature_request(
        p_request_id,
        jsonb_build_object(
            'status', 'declined',
            'implementation_notes', trim(p_reason)
        ),
        p_admin_user_id
    );
END;
$$;

COMMENT ON FUNCTION admin.decline_feature_request(UUID, TEXT, UUID) IS
    'Decline a feature request with a required reason.';

GRANT EXECUTE ON FUNCTION admin.update_feature_request(UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.decline_feature_request(UUID, TEXT, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v70: Feature request management RPCs applied.';
END $$;
