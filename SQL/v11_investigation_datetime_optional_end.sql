-- ============================================================================
-- v736_11: Investigation start datetime required; end datetime optional
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v736_10_user_suspend_enrichment.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.suspend_platform_user(
    p_user_id UUID,
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_suspension_type TEXT DEFAULT 'standard',
    p_investigation_start TIMESTAMPTZ DEFAULT NULL,
    p_investigation_end TIMESTAMPTZ DEFAULT NULL,
    p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
    v_type TEXT;
    v_attachments JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'users.suspend') THEN
        RAISE EXCEPTION 'Permission denied: users.suspend required';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Suspension reason is required';
    END IF;

    v_type := lower(COALESCE(trim(p_suspension_type), 'standard'));
    IF v_type NOT IN ('standard', 'investigation') THEN
        RAISE EXCEPTION 'Invalid suspension type: %', p_suspension_type;
    END IF;

    IF v_type = 'investigation' THEN
        IF p_investigation_start IS NULL THEN
            RAISE EXCEPTION 'Investigation start date and time are required';
        END IF;
        IF p_investigation_end IS NOT NULL AND p_investigation_end < p_investigation_start THEN
            RAISE EXCEPTION 'Investigation end must be on or after the start date and time';
        END IF;
    END IF;

    v_attachments := COALESCE(p_attachments, '[]'::jsonb);
    IF jsonb_typeof(v_attachments) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Attachments payload must be a JSON array';
    END IF;

    SELECT to_jsonb(u.*)
    INTO v_prev
    FROM public.users u
    WHERE u.id = p_user_id
      AND COALESCE(u.is_deleted, FALSE) = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Platform user not found: %', p_user_id;
    END IF;

    UPDATE public.users
    SET is_suspended = TRUE,
        suspended_at = NOW(),
        suspended_reason = trim(p_reason),
        suspension_type = v_type,
        investigation_starts_at = CASE WHEN v_type = 'investigation' THEN p_investigation_start ELSE NULL END,
        investigation_ends_at = CASE WHEN v_type = 'investigation' THEN p_investigation_end ELSE NULL END,
        suspension_attachments = v_attachments,
        is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_user_id
      AND COALESCE(is_deleted, FALSE) = FALSE
      AND is_active = TRUE
      AND COALESCE(is_suspended, FALSE) = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only active, non-suspended platform users can be suspended: %', p_user_id;
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'users.suspend',
        'platform_user',
        p_user_id,
        jsonb_build_object(
            'reason', trim(p_reason),
            'suspension_type', v_type,
            'investigation_start', p_investigation_start,
            'investigation_end', p_investigation_end,
            'attachments', v_attachments
        ),
        v_prev,
        jsonb_build_object(
            'is_suspended', TRUE,
            'is_active', FALSE,
            'suspended_reason', trim(p_reason),
            'suspension_type', v_type,
            'investigation_starts_at', CASE WHEN v_type = 'investigation' THEN p_investigation_start ELSE NULL END,
            'investigation_ends_at', CASE WHEN v_type = 'investigation' THEN p_investigation_end ELSE NULL END,
            'suspension_attachments', v_attachments
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.suspend_platform_user(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated, service_role;
