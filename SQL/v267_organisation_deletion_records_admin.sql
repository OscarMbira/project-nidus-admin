-- ============================================================================
-- v267: Organisation deletion records and certificates in Admin (monorepo v1358 Slice 3b)
-- PRD: E:\project-nidus\projectprd\v1358_organisation_data_export_and_deletion_PRD.md (D6, D15)
-- Run after monorepo SQL v1606. Idempotent.
--
-- Extends the narrow exception of v265 / v266 (CLAUDE.md rule 34.5): Admin reads public.organisation_deletion_records
-- (who asked, approved and confirmed; dates; tables and rows deleted; what was kept; warnings; certificate) only
-- through these SECURITY DEFINER RPCs, gated by organisations.data.view, and reads the private Storage bucket
-- organisation-deletion-certificates (the PDF certificates) through a read-only policy with the same permission.
-- Nothing here changes a deletion; the deletion itself is run by the monorepo job organisation.deletion_execute.
--   public.admin_organisation_deletion_records()           every deletion record (newest first)
--   public.admin_organisation_data_overview(account)       (replaces v266) + this organisation's deletion records
-- Also seeds the ID Generation rule, so records get references like ODL-001 (rule 16.2).
-- ============================================================================

-- ── ID Generation rule ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.organisation_deletion_records') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE target_table = 'public.organisation_deletion_records') THEN
    PERFORM admin.create_id_generation_rule(
      'public.organisation_deletion_records',
      CASE WHEN EXISTS (SELECT 1 FROM admin.id_generation_rules WHERE table_abbreviation = 'ODL' AND is_active = TRUE) THEN 'ODLR' ELSE 'ODL' END,
      'Organisation deletion record identifiers (deletion certificates)',
      '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE,
      (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
      'sequential', FALSE, NULL, NULL
    );
  ELSE
    RAISE NOTICE 'v267: public.organisation_deletion_records rule skipped (table missing or rule already exists)';
  END IF;
END $$;

-- ── Record JSON (no plan, progress, file list, members or recipient addresses) ──
CREATE OR REPLACE FUNCTION public.admin_organisation_deletion_record_json(d public.organisation_deletion_records)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
  SELECT jsonb_build_object(
    'id', d.id, 'reference', NULLIF(d.deletion_reference, ''), 'status', d.status,
    'account_id', d.account_id, 'organisation', d.organisation_name, 'edition', d.product_edition,
    'request_reference', d.request_reference, 'reason', d.reason,
    'requested_by', d.requested_by_name,
    'opened_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = d.opened_by_admin),
    'requested_at', d.requested_at,
    'approved_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = d.approved_by_admin),
    'approved_at', d.approved_at, 'approval_reason', d.approval_reason,
    'confirmed_by', d.confirmed_by_name, 'confirmed_at', d.confirmed_at,
    'locked_at', d.locked_at, 'due_at', d.due_at, 'started_at', d.started_at, 'finished_at', d.finished_at,
    'tables_deleted', d.tables_deleted, 'table_count', jsonb_array_length(d.tables_deleted),
    'rows_deleted', d.rows_deleted, 'kept', d.kept,
    'files_total', d.files_total, 'files_done', d.files_done, 'files_not_removed', jsonb_array_length(d.files_failed),
    'members_removed', d.members_removed, 'members_kept', d.members_kept,
    'recipients', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', e ->> 'name')), '[]'::jsonb) FROM jsonb_array_elements(d.recipients) e),
    'warnings', d.warnings, 'error', d.last_error,
    'certificate_path', d.certificate_path, 'certificate_sent_at', d.certificate_sent_at,
    'legal_hold', (SELECT a.legal_hold FROM public.accounts a WHERE a.id = d.account_id),
    'created_at', d.created_at);
$$;

CREATE OR REPLACE FUNCTION public.admin_organisation_deletion_records(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('organisations.data.view', p_admin_user_id);
  RETURN COALESCE((SELECT jsonb_agg(public.admin_organisation_deletion_record_json(d) ORDER BY d.created_at DESC)
                     FROM public.organisation_deletion_records d), '[]'::jsonb);
END;
$$;

-- ── Overview (replaces v266): adds this organisation's deletion records ─────
CREATE OR REPLACE FUNCTION public.admin_organisation_data_overview(p_account_id UUID, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_acc public.accounts;
BEGIN
  PERFORM public.admin_require_public_site_permission('organisations.data.view', p_admin_user_id);
  v_acc := (SELECT a FROM public.accounts a WHERE a.id = p_account_id);
  IF v_acc.id IS NULL THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  RETURN jsonb_build_object(
    'account_id', v_acc.id,
    'is_deleted', COALESCE(v_acc.is_deleted, FALSE),
    'legal_hold', v_acc.legal_hold,
    'legal_hold_reason', v_acc.legal_hold_reason,
    'legal_hold_since', v_acc.legal_hold_since,
    'legal_hold_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = v_acc.legal_hold_by_admin),
    'locked_at', v_acc.locked_at,
    'deletion_due_at', v_acc.deletion_due_at,
    'owner', (SELECT jsonb_build_object('user_id', u.id, 'name', COALESCE(u.display_name, u.full_name, u.email), 'email', u.email)
                FROM public.users u WHERE u.id = v_acc.owner_user_id),
    'candidates', public.organisation_owner_candidates(v_acc.id),
    'requests', COALESCE((SELECT jsonb_agg(public.admin_organisation_data_request_json(r) ORDER BY r.created_at DESC)
                            FROM public.organisation_data_requests r WHERE r.account_id = v_acc.id), '[]'::jsonb),
    'deletion_records', COALESCE((SELECT jsonb_agg(public.admin_organisation_deletion_record_json(d) ORDER BY d.created_at DESC)
                                    FROM public.organisation_deletion_records d WHERE d.account_id = v_acc.id), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_organisation_deletion_record_json(public.organisation_deletion_records) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_organisation_deletion_records(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_organisation_data_overview(UUID, UUID) TO authenticated, service_role;

-- ── Certificates: system admins with organisations.data.view may read (download) them ──
CREATE OR REPLACE FUNCTION public.auth_can_read_organisation_deletion_certificates()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := admin.current_admin_user_id();
BEGIN
  RETURN v_admin IS NOT NULL AND admin.check_admin_permission(v_admin, 'organisations.data.view');
END;
$$;
REVOKE ALL ON FUNCTION public.auth_can_read_organisation_deletion_certificates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_read_organisation_deletion_certificates() TO authenticated, service_role;

DROP POLICY IF EXISTS "Deletion certificates: admins with organisation data access can read" ON storage.objects;
CREATE POLICY "Deletion certificates: admins with organisation data access can read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'organisation-deletion-certificates' AND public.auth_can_read_organisation_deletion_certificates());

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN RAISE NOTICE 'v267 applied: organisation deletion records and certificates in Admin'; END $$;
