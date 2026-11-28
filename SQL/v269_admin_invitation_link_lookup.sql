-- ============================================================================
-- v269: Invitation link lookup by invitation id, admin user id or email (fixes v268)
-- ============================================================================
-- v268's admin.admin_invitation_link_details(UUID) expected the new admin user's id, but admin.invite_admin_user
-- returns the INVITATION's id, so the invite page got "Admin user not found" and no email was sent. It also gave no
-- way to email an invitation that already exists (a second Send Invite is refused while one is pending).
-- This replaces it with admin.admin_invitation_link_details(p_ref TEXT): p_ref may be an invitation id, an admin user
-- id or an email address; it returns the newest PENDING, unexpired invitation that matches. Only an admin with
-- `admins.invite` may call it. Idempotent. No data changes.
-- ============================================================================

DROP FUNCTION IF EXISTS admin.admin_invitation_link_details(UUID);

CREATE OR REPLACE FUNCTION admin.admin_invitation_link_details(p_ref TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_admin UUID := admin.current_admin_user_id();
  v_ref   TEXT := btrim(COALESCE(p_ref, ''));
  v_email TEXT;
  v_row   admin.admin_invitations;
BEGIN
  IF v_admin IS NULL OR NOT admin.check_admin_permission(v_admin, 'admins.invite') THEN
    RAISE EXCEPTION 'Permission denied: admins.invite required';
  END IF;
  IF v_ref = '' THEN RAISE EXCEPTION 'An invitation, admin user or email is required'; END IF;

  IF v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    -- An invitation id first, then an admin user id.
    v_email := COALESCE(
      (SELECT lower(ai.email) FROM admin.admin_invitations ai WHERE ai.id = v_ref::UUID),
      (SELECT lower(au.email) FROM admin.admin_users au WHERE au.id = v_ref::UUID));
  ELSE
    v_email := lower(v_ref);
  END IF;
  IF v_email IS NULL THEN RAISE EXCEPTION 'No invitation or admin user matches'; END IF;

  v_row := (SELECT ai FROM admin.admin_invitations ai
             WHERE lower(ai.email) = v_email AND ai.status = 'pending' AND ai.expires_at > NOW()
             ORDER BY ai.created_at DESC LIMIT 1);
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'There is no pending invitation for %', v_email; END IF;

  RETURN jsonb_build_object(
    'invitation_id', v_row.id,
    'token', v_row.token,
    'email', v_row.email,
    'role', v_row.target_role,
    'role_label', COALESCE((SELECT ar.role_name FROM admin.admin_roles ar WHERE ar.role_key = v_row.target_role LIMIT 1),
                           initcap(replace(v_row.target_role, '_', ' '))),
    'message', v_row.custom_message,
    'expires_at', v_row.expires_at,
    'invited_by', (SELECT COALESCE(au.full_name, au.email) FROM admin.admin_users au WHERE au.id = v_row.invited_by));
END;
$$;

REVOKE ALL ON FUNCTION admin.admin_invitation_link_details(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.admin_invitation_link_details(TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ── Check (read-only): pending invitations ───────────────────────────────────
SELECT ai.email, ai.target_role, ai.status, ai.expires_at, ai.created_at
  FROM admin.admin_invitations ai
 WHERE ai.status = 'pending'
 ORDER BY ai.created_at DESC;
