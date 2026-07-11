-- ============================================================================
-- v736_02: User & Organisation Management RPC Functions
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01_admin_schema.sql, v735_02_admin_auth_functions.sql, v735_05_admin_support_tables.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.deactivate_platform_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.deactivate_platform_user(
    p_user_id UUID,
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'users.deactivate') THEN
        RAISE EXCEPTION 'Permission denied: users.deactivate required';
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
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_user_id
      AND COALESCE(is_deleted, FALSE) = FALSE
      AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Platform user is already inactive: %', p_user_id;
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'users.deactivate',
        'platform_user',
        p_user_id,
        jsonb_build_object('reason', COALESCE(trim(p_reason), 'No reason provided')),
        v_prev,
        jsonb_build_object('is_active', FALSE)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.reset_user_password
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.reset_user_password(
    p_user_id UUID,
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
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'users.password_reset') THEN
        RAISE EXCEPTION 'Permission denied: users.password_reset required';
    END IF;

    SELECT to_jsonb(u.*)
    INTO v_prev
    FROM public.users u
    WHERE u.id = p_user_id
      AND COALESCE(u.is_deleted, FALSE) = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Platform user not found: %', p_user_id;
    END IF;

    -- Actual reset delivery (email/link/token) is handled by the application service layer.
    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'users.password_reset',
        'platform_user',
        p_user_id,
        jsonb_build_object('delivery', 'external_service'),
        v_prev,
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.verify_organisation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.verify_organisation(
    p_account_id UUID,
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
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'orgs.verify') THEN
        RAISE EXCEPTION 'Permission denied: orgs.verify required';
    END IF;

    SELECT to_jsonb(a.*)
    INTO v_prev
    FROM public.accounts a
    WHERE a.id = p_account_id
      AND COALESCE(a.is_deleted, FALSE) = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organisation account not found: %', p_account_id;
    END IF;

    UPDATE public.accounts
    SET is_verified = TRUE,
        verified_at = COALESCE(verified_at, NOW()),
        updated_at = NOW()
    WHERE id = p_account_id
      AND COALESCE(is_deleted, FALSE) = FALSE;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'orgs.verify',
        'organisation',
        p_account_id,
        NULL,
        v_prev,
        jsonb_build_object('is_verified', TRUE)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.suspend_organisation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.suspend_organisation(
    p_account_id UUID,
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'orgs.suspend') THEN
        RAISE EXCEPTION 'Permission denied: orgs.suspend required';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Suspension reason is required';
    END IF;

    SELECT to_jsonb(a.*)
    INTO v_prev
    FROM public.accounts a
    WHERE a.id = p_account_id
      AND COALESCE(a.is_deleted, FALSE) = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organisation account not found: %', p_account_id;
    END IF;

    UPDATE public.accounts
    SET is_suspended = TRUE,
        suspended_at = NOW(),
        suspended_reason = trim(p_reason),
        is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_account_id
      AND COALESCE(is_deleted, FALSE) = FALSE;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'orgs.suspend',
        'organisation',
        p_account_id,
        jsonb_build_object('reason', trim(p_reason)),
        v_prev,
        jsonb_build_object(
            'is_suspended', TRUE,
            'is_active', FALSE,
            'suspended_reason', trim(p_reason)
        )
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.start_impersonation
-- ---------------------------------------------------------------------------
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

    IF NOT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = p_target_user_id
    ) THEN
        RAISE EXCEPTION 'Target auth user not found: %', p_target_user_id;
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
        p_target_user_id,
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
            'target_user_id', p_target_user_id,
            'target_system', p_target_system,
            'reason', trim(p_reason)
        ),
        NULL,
        jsonb_build_object('started_at', NOW())
    );

    RETURN v_impersonation_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.end_impersonation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.end_impersonation(
    p_impersonation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_actor_admin_id UUID;
    v_owner_admin_id UUID;
    v_prev JSONB;
BEGIN
    v_actor_admin_id := admin.current_admin_user_id();
    IF v_actor_admin_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_actor_admin_id, 'users.impersonate') THEN
        RAISE EXCEPTION 'Permission denied: users.impersonate required';
    END IF;

    SELECT to_jsonb(il.*), il.admin_user_id
    INTO v_prev, v_owner_admin_id
    FROM admin.impersonation_log il
    WHERE il.id = p_impersonation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Impersonation record not found: %', p_impersonation_id;
    END IF;

    IF (v_prev ->> 'ended_at') IS NOT NULL THEN
        RAISE EXCEPTION 'Impersonation is already ended: %', p_impersonation_id;
    END IF;

    UPDATE admin.impersonation_log
    SET ended_at = NOW()
    WHERE id = p_impersonation_id
      AND ended_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to end impersonation: %', p_impersonation_id;
    END IF;

    PERFORM admin.log_admin_action(
        v_actor_admin_id,
        'users.impersonate.end',
        'impersonation',
        p_impersonation_id,
        jsonb_build_object('owner_admin_user_id', v_owner_admin_id),
        v_prev,
        jsonb_build_object('ended_at', NOW())
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.deactivate_platform_user(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reset_user_password(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.verify_organisation(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.suspend_organisation(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.start_impersonation(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.end_impersonation(UUID) TO authenticated, service_role;
