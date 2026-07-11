-- ============================================================================
-- v66: Admin RPC — list organisation (account) members
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v45 users/orgs admin RLS, platform accounts/users tables
--
-- Problem: fetchAccountMembers filtered public.users by account_id, but users
-- has no account_id column. Membership is via owner, invitations, and projects.
-- Run: pnpm run admin:migrate-account-members
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.get_account_members(
    p_account_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    email VARCHAR,
    full_name VARCHAR,
    is_active BOOLEAN,
    member_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'orgs.view') THEN
        RAISE EXCEPTION 'Permission denied: orgs.view required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.accounts a
        WHERE a.id = p_account_id
          AND COALESCE(a.is_deleted, FALSE) = FALSE
    ) THEN
        RAISE EXCEPTION 'Organisation account not found: %', p_account_id;
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.email::VARCHAR,
        u.full_name::VARCHAR,
        u.is_active,
        MIN(members.member_role)::TEXT AS member_role
    FROM (
        SELECT a.owner_user_id AS user_id, 'owner'::TEXT AS member_role
        FROM public.accounts a
        WHERE a.id = p_account_id
          AND a.owner_user_id IS NOT NULL

        UNION ALL

        SELECT
            COALESCE(oi.accepted_by_user_id, oi.invited_user_id) AS user_id,
            'organisation_invitation'::TEXT AS member_role
        FROM public.organisation_invitations oi
        WHERE oi.organisation_id = p_account_id
          AND oi.invitation_status = 'accepted'
          AND COALESCE(oi.is_deleted, FALSE) = FALSE
          AND COALESCE(oi.accepted_by_user_id, oi.invited_user_id) IS NOT NULL

        UNION ALL

        SELECT up.user_id, 'project_member'::TEXT AS member_role
        FROM public.projects p
        INNER JOIN public.user_projects up ON up.project_id = p.id
        WHERE p.account_id = p_account_id
          AND COALESCE(p.is_deleted, FALSE) = FALSE
          AND COALESCE(up.is_deleted, FALSE) = FALSE
          AND COALESCE(up.is_active, TRUE) = TRUE

        UNION ALL

        SELECT pm.user_id, 'project_membership'::TEXT AS member_role
        FROM public.projects p
        INNER JOIN public.project_memberships pm ON pm.project_id = p.id
        WHERE p.account_id = p_account_id
          AND COALESCE(p.is_deleted, FALSE) = FALSE
          AND pm.invitation_status = 'accepted'
          AND COALESCE(pm.is_active, TRUE) = TRUE

        UNION ALL

        SELECT ur.user_id, 'project_role'::TEXT AS member_role
        FROM public.projects p
        INNER JOIN public.user_roles ur ON ur.project_id = p.id
        WHERE p.account_id = p_account_id
          AND COALESCE(p.is_deleted, FALSE) = FALSE
          AND ur.is_active = TRUE
          AND COALESCE(ur.is_deleted, FALSE) = FALSE
    ) members
    INNER JOIN public.users u ON u.id = members.user_id
    WHERE COALESCE(u.is_deleted, FALSE) = FALSE
    GROUP BY u.id, u.email, u.full_name, u.is_active
    ORDER BY u.full_name NULLS LAST, u.email;
END;
$$;

COMMENT ON FUNCTION admin.get_account_members(UUID, UUID) IS
    'Returns distinct platform users linked to an organisation via ownership, invitations, or project access.';

GRANT EXECUTE ON FUNCTION admin.get_account_members(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v66: admin.get_account_members RPC applied.';
END $$;
