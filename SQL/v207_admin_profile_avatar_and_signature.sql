-- =============================================================================
-- v207: Admin profile picture + signature management (v894 monorepo PRD / v207
-- admin plan). Admin has no existing self-service write path on admin_users —
-- every mutation in this repo goes through SECURITY DEFINER RPCs, not direct
-- table RLS+UPDATE (unlike the monorepo's public.users pattern) — so this file
-- follows that convention rather than inventing a new one.
--
-- Two buckets (mirrors monorepo v894's user-avatars / user-signatures):
--   admin-user-avatars    — {auth_user_id}/avatar.{ext}
--   admin-user-signatures — {auth_user_id}/signature.{ext}
-- Admin has no multi-tenant "account" concept the way Platform/Simulator do
-- (each Admin instance is one operator's internal team) — avatar visibility is
-- "any authenticated admin", the closest equivalent of the monorepo's
-- account-scoped read.
-- =============================================================================

ALTER TABLE admin.admin_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS admin.admin_user_signature_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_bucket TEXT NOT NULL DEFAULT 'admin-user-signatures',
    storage_path TEXT NOT NULL,
    file_name TEXT,
    mime_type TEXT,
    file_size INTEGER,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin.admin_user_signature_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_admin_signature_images_select ON admin.admin_user_signature_images;
CREATE POLICY policy_admin_signature_images_select
    ON admin.admin_user_signature_images FOR SELECT TO authenticated
    USING (auth_user_id = auth.uid());

-- Writes go through the RPCs below (SECURITY DEFINER, bypass RLS internally) —
-- no direct INSERT/UPDATE/DELETE policy, matching admin_users' own convention.

-- ---------------------------------------------------------------------------
-- RPCs — self-service only (a user manages their own avatar/signature; no
-- admin.check_admin_permission() gate needed, this isn't a governed action on
-- someone else's record). No admin.log_admin_action() either, for the same
-- reason personal Full Name/Bio edits elsewhere in this system aren't logged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin.update_own_avatar(p_avatar_path TEXT)
RETURNS admin.admin_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin
AS $$
DECLARE
  v_row admin.admin_users;
BEGIN
  UPDATE admin.admin_users
  SET avatar_url = p_avatar_path, updated_at = NOW()
  WHERE auth_user_id = auth.uid()
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Admin user not found for current session';
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION admin.remove_own_avatar()
RETURNS admin.admin_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin
AS $$
DECLARE
  v_row admin.admin_users;
BEGIN
  UPDATE admin.admin_users
  SET avatar_url = NULL, updated_at = NOW()
  WHERE auth_user_id = auth.uid()
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Admin user not found for current session';
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION admin.save_own_signature(
    p_storage_path TEXT, p_file_name TEXT, p_mime_type TEXT, p_file_size INTEGER
)
RETURNS admin.admin_user_signature_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin
AS $$
DECLARE
  v_row admin.admin_user_signature_images;
BEGIN
  INSERT INTO admin.admin_user_signature_images (
      auth_user_id, storage_bucket, storage_path, file_name, mime_type, file_size, updated_at
  )
  VALUES (auth.uid(), 'admin-user-signatures', p_storage_path, p_file_name, p_mime_type, p_file_size, NOW())
  ON CONFLICT (auth_user_id) DO UPDATE SET
      storage_path = EXCLUDED.storage_path,
      file_name = EXCLUDED.file_name,
      mime_type = EXCLUDED.mime_type,
      file_size = EXCLUDED.file_size,
      updated_at = NOW()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_own_signature()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin
AS $$
BEGIN
  DELETE FROM admin.admin_user_signature_images WHERE auth_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION admin.update_own_avatar(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.remove_own_avatar() TO authenticated;
GRANT EXECUTE ON FUNCTION admin.save_own_signature(TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin.delete_own_signature() TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets + RLS
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-user-avatars', 'admin-user-avatars', false, 2097152,
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-user-signatures', 'admin-user-signatures', false, 2097152,
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION admin.auth_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = admin
AS $$
  SELECT EXISTS (SELECT 1 FROM admin.admin_users WHERE auth_user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION admin.auth_user_is_admin() TO authenticated;

DROP POLICY IF EXISTS "Admin avatar: any admin can view" ON storage.objects;
CREATE POLICY "Admin avatar: any admin can view"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'admin-user-avatars' AND admin.auth_user_is_admin());

DROP POLICY IF EXISTS "Admin avatar: owner can write their own" ON storage.objects;
CREATE POLICY "Admin avatar: owner can write their own"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'admin-user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'admin-user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Admin signature: owner only" ON storage.objects;
CREATE POLICY "Admin signature: owner only"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'admin-user-signatures' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'admin-user-signatures' AND (storage.foldername(name))[1] = auth.uid()::text);

DO $$
BEGIN
  RAISE NOTICE 'v207_admin_profile_avatar_and_signature.sql applied — admin_users.avatar_url, admin_user_signature_images, RPCs, and buckets ensured';
END $$;
