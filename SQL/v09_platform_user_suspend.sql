-- ============================================================================
-- v736_09: Platform User Suspend / Reactivate
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v736_02_user_mgmt_functions.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extend public.users with suspension columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

COMMENT ON COLUMN public.users.is_suspended IS 'User temporarily suspended by admin action';
COMMENT ON COLUMN public.users.suspended_at IS 'Timestamp when the user was suspended';
COMMENT ON COLUMN public.users.suspended_reason IS 'Reason recorded when the user was suspended';

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('users.suspend',    'Suspend Users',    'users', 'Temporarily suspend platform user accounts'),
    ('users.reactivate', 'Reactivate Users', 'users', 'Reactivate suspended platform user accounts')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('users.suspend', 'users.reactivate')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'users.suspend'),
    ('system_admin', 'users.reactivate')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- admin.suspend_platform_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.suspend_platform_user(
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'users.suspend') THEN
        RAISE EXCEPTION 'Permission denied: users.suspend required';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Suspension reason is required';
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
-- admin.reactivate_platform_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.reactivate_platform_user(
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'users.reactivate') THEN
        RAISE EXCEPTION 'Permission denied: users.reactivate required';
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
    SET is_suspended = FALSE,
        suspended_at = NULL,
        suspended_reason = NULL,
        is_active = TRUE,
        updated_at = NOW()
    WHERE id = p_user_id
      AND COALESCE(is_deleted, FALSE) = FALSE
      AND COALESCE(is_suspended, FALSE) = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only suspended platform users can be reactivated: %', p_user_id;
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'users.reactivate',
        'platform_user',
        p_user_id,
        NULL,
        v_prev,
        jsonb_build_object(
            'is_suspended', FALSE,
            'is_active', TRUE,
            'suspended_reason', NULL
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.suspend_platform_user(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reactivate_platform_user(UUID, UUID) TO authenticated, service_role;
