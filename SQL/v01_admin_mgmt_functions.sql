-- ============================================================================
-- v736_01: Admin Management RPC Functions
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01_admin_schema.sql, v735_01b_admin_seed_data.sql, v735_02_admin_auth_functions.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.invite_admin_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.invite_admin_user(
    p_email TEXT,
    p_role TEXT,
    p_message TEXT DEFAULT NULL,
    p_expiry_hours INTEGER DEFAULT NULL,
    p_invited_by_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_invited_by_id UUID;
    v_normalized_email TEXT;
    v_expiry_hours INTEGER;
    v_max_expiry_hours INTEGER;
    v_role_can_be_invited BOOLEAN;
    v_token TEXT;
    v_invitation_id UUID;
    v_admin_user_id UUID;
    v_default_name TEXT;
BEGIN
    v_invited_by_id := COALESCE(p_invited_by_id, admin.current_admin_user_id());
    IF v_invited_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve inviting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_invited_by_id, 'admins.invite') THEN
        RAISE EXCEPTION 'Permission denied: admins.invite required';
    END IF;

    v_normalized_email := lower(trim(p_email));
    IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
        RAISE EXCEPTION 'Email is required';
    END IF;

    IF p_role IS NULL OR trim(p_role) = '' THEN
        RAISE EXCEPTION 'Target role is required';
    END IF;

    IF p_role = 'super_admin' THEN
        RAISE EXCEPTION 'Role super_admin cannot be invited';
    END IF;

    SELECT ar.can_be_invited
    INTO v_role_can_be_invited
    FROM admin.admin_roles ar
    WHERE ar.role_key = p_role
      AND ar.is_active = TRUE
    LIMIT 1;

    IF NOT FOUND OR COALESCE(v_role_can_be_invited, FALSE) = FALSE THEN
        RAISE EXCEPTION 'Invalid or non-invitable role: %', p_role;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM admin.admin_users au
        WHERE lower(au.email) = v_normalized_email
    ) THEN
        RAISE EXCEPTION 'Admin user already exists for email: %', v_normalized_email;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM admin.admin_invitations ai
        WHERE lower(ai.email) = v_normalized_email
          AND ai.status = 'pending'
          AND ai.expires_at > NOW()
    ) THEN
        RAISE EXCEPTION 'A pending invitation already exists for email: %', v_normalized_email;
    END IF;

    v_expiry_hours := COALESCE(
        p_expiry_hours,
        COALESCE(admin.get_system_setting('invite.expiry_hours', '48')::INTEGER, 48)
    );
    v_max_expiry_hours := COALESCE(admin.get_system_setting('invite.max_expiry_hours', '72')::INTEGER, 72);

    IF v_expiry_hours <= 0 THEN
        RAISE EXCEPTION 'expiry_hours must be greater than 0';
    END IF;
    IF v_expiry_hours > v_max_expiry_hours THEN
        RAISE EXCEPTION 'expiry_hours exceeds configured maximum (% hours)', v_max_expiry_hours;
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');
    v_default_name := split_part(v_normalized_email, '@', 1);

    INSERT INTO admin.admin_users (
        email,
        full_name,
        role,
        activation_status,
        created_by
    )
    VALUES (
        v_normalized_email,
        v_default_name,
        p_role,
        'invited',
        v_invited_by_id
    )
    RETURNING id INTO v_admin_user_id;

    INSERT INTO admin.admin_invitations (
        token,
        email,
        target_role,
        custom_message,
        status,
        invited_by,
        expires_at
    )
    VALUES (
        v_token,
        v_normalized_email,
        p_role,
        p_message,
        'pending',
        v_invited_by_id,
        NOW() + make_interval(hours => v_expiry_hours)
    )
    RETURNING id INTO v_invitation_id;

    PERFORM admin.log_admin_action(
        v_invited_by_id,
        'admins.invite',
        'admin_user',
        v_admin_user_id,
        jsonb_build_object(
            'email', v_normalized_email,
            'role', p_role,
            'invitation_id', v_invitation_id,
            'expiry_hours', v_expiry_hours
        ),
        NULL,
        jsonb_build_object(
            'activation_status', 'invited',
            'role', p_role
        )
    );

    RETURN v_invitation_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.activate_admin_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.activate_admin_user(
    p_admin_user_id UUID,
    p_activated_by_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_activated_by_id UUID;
    v_prev JSONB;
BEGIN
    v_activated_by_id := COALESCE(p_activated_by_id, admin.current_admin_user_id());
    IF v_activated_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve activating admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_activated_by_id, 'admins.activate') THEN
        RAISE EXCEPTION 'Permission denied: admins.activate required';
    END IF;

    SELECT to_jsonb(au.*) INTO v_prev
    FROM admin.admin_users au
    WHERE au.id = p_admin_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin user not found: %', p_admin_user_id;
    END IF;

    UPDATE admin.admin_users
    SET activation_status = 'active',
        activated_by = v_activated_by_id,
        activated_at = NOW(),
        rejection_reason = NULL,
        suspended_reason = NULL,
        updated_at = NOW()
    WHERE id = p_admin_user_id
      AND activation_status IN ('pending_activation', 'invited', 'suspended');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin user cannot be activated from current status';
    END IF;

    PERFORM admin.log_admin_action(
        v_activated_by_id,
        'admins.activate',
        'admin_user',
        p_admin_user_id,
        NULL,
        v_prev,
        jsonb_build_object('activation_status', 'active')
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.reject_admin_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.reject_admin_user(
    p_admin_user_id UUID,
    p_reason TEXT,
    p_rejected_by_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_rejected_by_id UUID;
    v_prev JSONB;
BEGIN
    v_rejected_by_id := COALESCE(p_rejected_by_id, admin.current_admin_user_id());
    IF v_rejected_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve rejecting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_rejected_by_id, 'admins.reject') THEN
        RAISE EXCEPTION 'Permission denied: admins.reject required';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Rejection reason is required';
    END IF;

    SELECT to_jsonb(au.*) INTO v_prev
    FROM admin.admin_users au
    WHERE au.id = p_admin_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin user not found: %', p_admin_user_id;
    END IF;

    UPDATE admin.admin_users
    SET activation_status = 'rejected',
        rejection_reason = trim(p_reason),
        updated_at = NOW()
    WHERE id = p_admin_user_id
      AND activation_status IN ('invited', 'pending_activation');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only invited or pending_activation admin users can be rejected';
    END IF;

    PERFORM admin.log_admin_action(
        v_rejected_by_id,
        'admins.reject',
        'admin_user',
        p_admin_user_id,
        jsonb_build_object('reason', trim(p_reason)),
        v_prev,
        jsonb_build_object('activation_status', 'rejected', 'rejection_reason', trim(p_reason))
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.suspend_admin_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.suspend_admin_user(
    p_admin_user_id UUID,
    p_reason TEXT,
    p_suspended_by_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_suspended_by_id UUID;
    v_prev JSONB;
BEGIN
    v_suspended_by_id := COALESCE(p_suspended_by_id, admin.current_admin_user_id());
    IF v_suspended_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve suspending admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_suspended_by_id, 'admins.suspend') THEN
        RAISE EXCEPTION 'Permission denied: admins.suspend required';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Suspension reason is required';
    END IF;

    IF p_admin_user_id = v_suspended_by_id THEN
        RAISE EXCEPTION 'You cannot suspend your own admin account';
    END IF;

    SELECT to_jsonb(au.*) INTO v_prev
    FROM admin.admin_users au
    WHERE au.id = p_admin_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin user not found: %', p_admin_user_id;
    END IF;

    UPDATE admin.admin_users
    SET activation_status = 'suspended',
        suspended_reason = trim(p_reason),
        updated_at = NOW()
    WHERE id = p_admin_user_id
      AND activation_status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only active admin users can be suspended';
    END IF;

    UPDATE admin.admin_sessions
    SET is_active = FALSE,
        ended_at = NOW()
    WHERE admin_user_id = p_admin_user_id
      AND is_active = TRUE;

    PERFORM admin.log_admin_action(
        v_suspended_by_id,
        'admins.suspend',
        'admin_user',
        p_admin_user_id,
        jsonb_build_object('reason', trim(p_reason)),
        v_prev,
        jsonb_build_object('activation_status', 'suspended', 'suspended_reason', trim(p_reason))
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.reactivate_admin_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.reactivate_admin_user(
    p_admin_user_id UUID,
    p_reactivated_by_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_reactivated_by_id UUID;
    v_prev JSONB;
BEGIN
    v_reactivated_by_id := COALESCE(p_reactivated_by_id, admin.current_admin_user_id());
    IF v_reactivated_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve reactivating admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_reactivated_by_id, 'admins.reactivate') THEN
        RAISE EXCEPTION 'Permission denied: admins.reactivate required';
    END IF;

    SELECT to_jsonb(au.*) INTO v_prev
    FROM admin.admin_users au
    WHERE au.id = p_admin_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin user not found: %', p_admin_user_id;
    END IF;

    UPDATE admin.admin_users
    SET activation_status = 'active',
        suspended_reason = NULL,
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = p_admin_user_id
      AND activation_status = 'suspended';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only suspended admin users can be reactivated';
    END IF;

    PERFORM admin.log_admin_action(
        v_reactivated_by_id,
        'admins.reactivate',
        'admin_user',
        p_admin_user_id,
        NULL,
        v_prev,
        jsonb_build_object('activation_status', 'active')
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.deactivate_admin_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.deactivate_admin_user(
    p_admin_user_id UUID,
    p_deactivated_by_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_deactivated_by_id UUID;
    v_prev JSONB;
BEGIN
    v_deactivated_by_id := COALESCE(p_deactivated_by_id, admin.current_admin_user_id());
    IF v_deactivated_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve deactivating admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_deactivated_by_id, 'admins.deactivate') THEN
        RAISE EXCEPTION 'Permission denied: admins.deactivate required';
    END IF;

    IF p_admin_user_id = v_deactivated_by_id THEN
        RAISE EXCEPTION 'You cannot deactivate your own admin account';
    END IF;

    SELECT to_jsonb(au.*) INTO v_prev
    FROM admin.admin_users au
    WHERE au.id = p_admin_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin user not found: %', p_admin_user_id;
    END IF;

    UPDATE admin.admin_users
    SET activation_status = 'deactivated',
        updated_at = NOW()
    WHERE id = p_admin_user_id
      AND activation_status <> 'deactivated';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin user is already deactivated';
    END IF;

    UPDATE admin.admin_sessions
    SET is_active = FALSE,
        ended_at = NOW()
    WHERE admin_user_id = p_admin_user_id
      AND is_active = TRUE;

    PERFORM admin.log_admin_action(
        v_deactivated_by_id,
        'admins.deactivate',
        'admin_user',
        p_admin_user_id,
        NULL,
        v_prev,
        jsonb_build_object('activation_status', 'deactivated')
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_admin_role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_admin_role(
    p_admin_user_id UUID,
    p_new_role TEXT,
    p_changed_by_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_changed_by_id UUID;
    v_prev JSONB;
    v_current_role TEXT;
    v_new_role_exists BOOLEAN;
BEGIN
    v_changed_by_id := COALESCE(p_changed_by_id, admin.current_admin_user_id());
    IF v_changed_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve role-changing admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_changed_by_id, 'admins.roles.assign') THEN
        RAISE EXCEPTION 'Permission denied: admins.roles.assign required';
    END IF;

    IF p_new_role IS NULL OR trim(p_new_role) = '' THEN
        RAISE EXCEPTION 'New role is required';
    END IF;

    SELECT to_jsonb(au.*), au.role
    INTO v_prev, v_current_role
    FROM admin.admin_users au
    WHERE au.id = p_admin_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin user not found: %', p_admin_user_id;
    END IF;

    SELECT TRUE
    INTO v_new_role_exists
    FROM admin.admin_roles ar
    WHERE ar.role_key = p_new_role
      AND ar.is_active = TRUE
    LIMIT 1;

    IF COALESCE(v_new_role_exists, FALSE) = FALSE THEN
        RAISE EXCEPTION 'Invalid or inactive target role: %', p_new_role;
    END IF;

    IF v_current_role = p_new_role THEN
        RAISE EXCEPTION 'Target admin already has role: %', p_new_role;
    END IF;

    UPDATE admin.admin_users
    SET role = p_new_role,
        updated_at = NOW()
    WHERE id = p_admin_user_id;

    PERFORM admin.log_admin_action(
        v_changed_by_id,
        'admins.roles.assign',
        'admin_user',
        p_admin_user_id,
        NULL,
        v_prev,
        jsonb_build_object('role', p_new_role)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.terminate_admin_session
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.terminate_admin_session(
    p_session_id UUID,
    p_terminated_by_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_terminated_by_id UUID;
    v_prev JSONB;
    v_target_admin_user_id UUID;
BEGIN
    v_terminated_by_id := COALESCE(p_terminated_by_id, admin.current_admin_user_id());
    IF v_terminated_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve terminating admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_terminated_by_id, 'admins.view') THEN
        RAISE EXCEPTION 'Permission denied: admins.view required';
    END IF;

    SELECT to_jsonb(s.*), s.admin_user_id
    INTO v_prev, v_target_admin_user_id
    FROM admin.admin_sessions s
    WHERE s.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin session not found: %', p_session_id;
    END IF;

    UPDATE admin.admin_sessions
    SET is_active = FALSE,
        ended_at = NOW()
    WHERE id = p_session_id
      AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin session is already inactive: %', p_session_id;
    END IF;

    PERFORM admin.log_admin_action(
        v_terminated_by_id,
        'admins.sessions.terminate',
        'admin_session',
        p_session_id,
        jsonb_build_object('target_admin_user_id', v_target_admin_user_id),
        v_prev,
        jsonb_build_object('is_active', FALSE, 'ended_at', NOW())
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.reset_admin_2fa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.reset_admin_2fa(
    p_admin_user_id UUID,
    p_reset_by_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_reset_by_id UUID;
    v_prev JSONB;
BEGIN
    v_reset_by_id := COALESCE(p_reset_by_id, admin.current_admin_user_id());
    IF v_reset_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve resetting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_reset_by_id, 'admins.view') THEN
        RAISE EXCEPTION 'Permission denied: admins.view required';
    END IF;

    SELECT to_jsonb(au.*) INTO v_prev
    FROM admin.admin_users au
    WHERE au.id = p_admin_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin user not found: %', p_admin_user_id;
    END IF;

    UPDATE admin.admin_users
    SET is_2fa_configured = FALSE,
        updated_at = NOW()
    WHERE id = p_admin_user_id;

    PERFORM admin.log_admin_action(
        v_reset_by_id,
        'admins.2fa.reset',
        'admin_user',
        p_admin_user_id,
        NULL,
        v_prev,
        jsonb_build_object('is_2fa_configured', FALSE)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_role_permissions (super_admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_role_permissions(
    p_role TEXT,
    p_permission_keys TEXT[],
    p_changed_by_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_changed_by_id UUID;
    v_changed_by_role TEXT;
    v_existing_permissions TEXT[];
    v_invalid_permissions TEXT[];
BEGIN
    v_changed_by_id := COALESCE(p_changed_by_id, admin.current_admin_user_id());
    IF v_changed_by_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve role permission editor';
    END IF;

    SELECT au.role
    INTO v_changed_by_role
    FROM admin.admin_users au
    WHERE au.id = v_changed_by_id
      AND au.activation_status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active admin user not found for updater: %', v_changed_by_id;
    END IF;

    IF v_changed_by_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Permission denied: super_admin role required';
    END IF;

    IF p_role IS NULL OR trim(p_role) = '' THEN
        RAISE EXCEPTION 'Target role is required';
    END IF;

    IF p_role = 'super_admin' THEN
        RAISE EXCEPTION 'Role permissions for super_admin cannot be modified';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM admin.admin_roles ar
        WHERE ar.role_key = p_role
          AND ar.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Invalid or inactive role: %', p_role;
    END IF;

    p_permission_keys := COALESCE(p_permission_keys, ARRAY[]::TEXT[]);

    SELECT array_agg(rp.permission_key ORDER BY rp.permission_key)
    INTO v_existing_permissions
    FROM admin.role_permissions rp
    WHERE rp.role = p_role;

    SELECT array_agg(missing.key ORDER BY missing.key)
    INTO v_invalid_permissions
    FROM (
        SELECT DISTINCT trim(k) AS key
        FROM unnest(p_permission_keys) AS k
        WHERE trim(k) <> ''
    ) missing
    WHERE NOT EXISTS (
        SELECT 1
        FROM admin.admin_permissions ap
        WHERE ap.permission_key = missing.key
          AND ap.is_active = TRUE
    );

    IF v_invalid_permissions IS NOT NULL AND array_length(v_invalid_permissions, 1) > 0 THEN
        RAISE EXCEPTION 'Invalid permission keys: %', array_to_string(v_invalid_permissions, ', ');
    END IF;

    DELETE FROM admin.role_permissions
    WHERE role = p_role;

    INSERT INTO admin.role_permissions (role, permission_key, granted_by)
    SELECT
        p_role,
        DISTINCT_KEYS.key,
        v_changed_by_id
    FROM (
        SELECT DISTINCT trim(k) AS key
        FROM unnest(p_permission_keys) AS k
        WHERE trim(k) <> ''
    ) AS DISTINCT_KEYS;

    PERFORM admin.log_admin_action(
        v_changed_by_id,
        'admins.roles.permissions.update',
        'role',
        NULL,
        jsonb_build_object('role', p_role),
        jsonb_build_object('permission_keys', COALESCE(v_existing_permissions, ARRAY[]::TEXT[])),
        jsonb_build_object('permission_keys', p_permission_keys)
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.invite_admin_user(TEXT, TEXT, TEXT, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.activate_admin_user(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reject_admin_user(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.suspend_admin_user(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reactivate_admin_user(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.deactivate_admin_user(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_admin_role(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.terminate_admin_session(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reset_admin_2fa(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_role_permissions(TEXT, TEXT[], UUID) TO authenticated, service_role;
