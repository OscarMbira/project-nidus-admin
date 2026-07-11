-- ============================================================================
-- v736_12: Resolve impersonation target to auth.users.id
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v736_02_user_mgmt_functions.sql
--
-- Admin UI lists public.users (profile id). Impersonation must use auth.users.id.
-- Accept either public.users.id or auth.users.id and resolve before logging.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.start_impersonation(
    p_admin_user_id UUID,
    p_target_user_id UUID,
    p_target_system TEXT,
    p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_impersonation_id UUID;
    v_target_auth_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'users.impersonate') THEN
        RAISE EXCEPTION 'Permission denied: users.impersonate required';
    END IF;

    IF p_target_system NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'Invalid target system: %', p_target_system;
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Impersonation reason is required';
    END IF;

    SELECT COALESCE(
        (
            SELECT u.auth_user_id
            FROM public.users u
            WHERE u.id = p_target_user_id
              AND COALESCE(u.is_deleted, FALSE) = FALSE
              AND u.auth_user_id IS NOT NULL
        ),
        (
            SELECT u.auth_user_id
            FROM public.users u
            WHERE u.auth_user_id = p_target_user_id
              AND COALESCE(u.is_deleted, FALSE) = FALSE
        ),
        (
            SELECT au.id
            FROM auth.users au
            WHERE au.id = p_target_user_id
        ),
        NULL
    )
    INTO v_target_auth_user_id;

    IF v_target_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Target auth user not found: % (no linked auth account for this platform user)', p_target_user_id;
    END IF;

    INSERT INTO admin.impersonation_log (
        admin_user_id,
        impersonation_mode,
        target_user_id,
        target_system,
        reason,
        started_at
    )
    VALUES (
        v_admin_user_id,
        'user',
        v_target_auth_user_id,
        p_target_system,
        trim(p_reason),
        NOW()
    )
    RETURNING id INTO v_impersonation_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'users.impersonate.start',
        'impersonation',
        v_impersonation_id,
        jsonb_build_object(
            'target_user_id', v_target_auth_user_id,
            'target_platform_user_id', p_target_user_id,
            'target_system', p_target_system,
            'reason', trim(p_reason)
        ),
        NULL,
        jsonb_build_object('started_at', NOW())
    );

    RETURN v_impersonation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.start_impersonation(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
