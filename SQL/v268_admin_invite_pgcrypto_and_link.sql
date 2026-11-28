-- ============================================================================
-- v268: Admin invitations work again and actually reach the invitee
-- ============================================================================
-- 1. "function gen_random_bytes(integer) does not exist" when inviting an admin. On Supabase the pgcrypto functions
--    (gen_random_bytes, crypt, gen_salt, digest, hmac) live in the `extensions` schema, but admin.invite_admin_user
--    (Admin SQL v01) pins its search path to `admin, public`. The same pattern exists in other functions (e.g. API
--    key creation, v23; payment settings, v46). This file adds `extensions` to the pinned search path of every
--    function in the admin and public schemas that calls a pgcrypto function and does not already include it.
--    Adding a schema to a search path changes nothing else about those functions.
-- 2. The invitation was created but no email was ever sent (the page only said it was). The new function
--    admin.admin_invitation_link_details(admin_user_id) returns what the invite email needs (the setup token, email,
--    role, message, expiry) for a PENDING invitation, only to an admin with `admins.invite`; the Admin page then
--    emails the /setup/<token> link through the existing send-email function and shows the link if sending fails.
-- Idempotent. No data changes.
-- ============================================================================

-- ── 1. pgcrypto functions: add `extensions` to pinned search paths ───────────
DO $$
DECLARE
  f       RECORD;
  v_path  TEXT;
  v_fixed INTEGER := 0;
BEGIN
  FOR f IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('admin', 'public')
       AND p.prokind = 'f'
       AND p.prosrc ~ '(gen_random_bytes|gen_salt|crypt\(|digest\(|hmac\()'
       AND p.proconfig IS NOT NULL
       AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
       AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%' AND c ~ '(^|[=, ])"?extensions"?(,|$)')
  LOOP
    v_path := (SELECT substr(c, length('search_path=') + 1) FROM unnest(f.proconfig) c WHERE c LIKE 'search_path=%' LIMIT 1);
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = %s, extensions', f.nspname, f.proname, f.args, v_path);
    v_fixed := v_fixed + 1;
    RAISE NOTICE 'v268: search_path of %.%(%) is now %, extensions', f.nspname, f.proname, f.args, v_path;
  END LOOP;
  RAISE NOTICE 'v268: % function(s) given the extensions schema', v_fixed;
END $$;

-- ── 2. Details for the invitation email ──────────────────────────────────────
CREATE OR REPLACE FUNCTION admin.admin_invitation_link_details(p_admin_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_admin UUID := admin.current_admin_user_id();
  v_email TEXT;
  v_row   admin.admin_invitations;
BEGIN
  IF v_admin IS NULL OR NOT admin.check_admin_permission(v_admin, 'admins.invite') THEN
    RAISE EXCEPTION 'Permission denied: admins.invite required';
  END IF;
  v_email := (SELECT lower(au.email) FROM admin.admin_users au WHERE au.id = p_admin_user_id);
  IF v_email IS NULL THEN RAISE EXCEPTION 'Admin user not found'; END IF;
  v_row := (SELECT ai FROM admin.admin_invitations ai
             WHERE lower(ai.email) = v_email AND ai.status = 'pending' AND ai.expires_at > NOW()
             ORDER BY ai.created_at DESC LIMIT 1);
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'There is no pending invitation for this admin'; END IF;
  RETURN jsonb_build_object(
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

REVOKE ALL ON FUNCTION admin.admin_invitation_link_details(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin.admin_invitation_link_details(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ── Check (read-only) ────────────────────────────────────────────────────────
SELECT n.nspname || '.' || p.proname AS function_name,
       (SELECT c FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%') AS search_path
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'admin' AND p.proname IN ('invite_admin_user', 'admin_invitation_link_details');
