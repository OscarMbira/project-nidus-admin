-- ============================================================================
-- v265: Organisation data — requests list, legal hold, ownership transfer (monorepo v1358 Slice 2)
-- PRD: E:\project-nidus\projectprd\v1358_organisation_data_export_and_deletion_PRD.md (D13, D14)
-- Run after monorepo SQL v1600 and v1602. Idempotent.
--
-- Narrow exception (CLAUDE.md rule 34.5): Admin reads public.organisation_data_requests and the account /
-- owner / candidate details it needs, sets public.accounts.legal_hold* and transfers ownership (through
-- public.organisation_transfer_owner_apply) only through these SECURITY DEFINER RPCs, gated by
-- organisations.data.view / .hold / .transfer, reason required, audited (admin.log_admin_action).
--   public.admin_organisation_data_requests()               list of export (later deletion) requests
--   public.admin_organisation_data_overview(account)        hold, owner, candidates, requests of one organisation
--   public.admin_organisation_set_legal_hold(account, on, reason)
--   public.admin_organisation_transfer_owner(account, new owner, reason)
-- Plus: Admin sidebar item Users & Organisations › Organisation Data Requests (/users/org-data-requests),
-- field help (Admin rule 23).
-- ============================================================================

-- ── Permissions ──────────────────────────────────────────────────────────────
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('organisations.data.view', 'View Organisation Data Requests', 'users',
   'See organisation export and deletion requests, legal holds and owners'),
  ('organisations.data.hold', 'Place Legal Holds', 'users',
   'Place or lift a legal hold that blocks deleting an organisation (reason required, audited)'),
  ('organisations.data.transfer', 'Transfer Organisation Ownership', 'users',
   'Make a PMO Admin of the organisation its Account Owner when the owner has left (reason required, audited)')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name, category = EXCLUDED.category, description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
  ('super_admin', 'organisations.data.view'),
  ('super_admin', 'organisations.data.hold'),
  ('super_admin', 'organisations.data.transfer'),
  ('system_admin', 'organisations.data.view'),
  ('system_admin', 'organisations.data.hold'),
  ('system_admin', 'organisations.data.transfer')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ── Read ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_organisation_data_requests(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('organisations.data.view', p_admin_user_id);
  IF to_regclass('public.organisation_data_requests') IS NULL THEN
    RAISE EXCEPTION 'Run monorepo SQL v1600 first (organisation data requests are missing)';
  END IF;
  RETURN jsonb_build_object(
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'reference', NULLIF(r.request_reference, ''), 'kind', r.kind, 'status', r.status,
               'account_id', r.account_id, 'account_name', a.account_name, 'account_code', a.account_code,
               'legal_hold', a.legal_hold,
               'requested_by', (SELECT COALESCE(u.display_name, u.full_name, u.email) FROM public.users u WHERE u.id = r.requested_by_user_id),
               'created_at', r.created_at, 'finished_at', r.finished_at, 'expires_at', r.expires_at,
               'table_count', r.table_count, 'row_count', r.row_count, 'file_count', r.file_count, 'byte_size', r.byte_size,
               'parts', jsonb_array_length(r.files), 'error', r.last_error)
             ORDER BY r.created_at DESC)
        FROM public.organisation_data_requests r
        JOIN public.accounts a ON a.id = r.account_id), '[]'::jsonb),
    'holds', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'account_id', a.id, 'account_name', a.account_name, 'account_code', a.account_code,
               'reason', a.legal_hold_reason, 'since', a.legal_hold_since,
               'by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = a.legal_hold_by_admin))
             ORDER BY lower(a.account_name), a.created_at)
        FROM public.accounts a WHERE a.legal_hold), '[]'::jsonb));
END;
$$;

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
    'legal_hold', v_acc.legal_hold,
    'legal_hold_reason', v_acc.legal_hold_reason,
    'legal_hold_since', v_acc.legal_hold_since,
    'legal_hold_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = v_acc.legal_hold_by_admin),
    'owner', (SELECT jsonb_build_object('user_id', u.id, 'name', COALESCE(u.display_name, u.full_name, u.email), 'email', u.email)
                FROM public.users u WHERE u.id = v_acc.owner_user_id),
    'candidates', public.organisation_owner_candidates(v_acc.id),
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'reference', NULLIF(r.request_reference, ''), 'kind', r.kind, 'status', r.status,
               'created_at', r.created_at, 'finished_at', r.finished_at, 'expires_at', r.expires_at,
               'row_count', r.row_count, 'byte_size', r.byte_size, 'error', r.last_error)
             ORDER BY r.created_at DESC)
        FROM public.organisation_data_requests r WHERE r.account_id = v_acc.id), '[]'::jsonb));
END;
$$;

-- ── Write ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_organisation_set_legal_hold(
  p_account_id UUID, p_on BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('organisations.data.hold', p_admin_user_id);
  v_acc   public.accounts;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_on IS NULL THEN RAISE EXCEPTION 'Choose to place or lift the hold'; END IF;
  v_acc := (SELECT a FROM public.accounts a WHERE a.id = p_account_id);
  IF v_acc.id IS NULL THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  IF v_acc.legal_hold = p_on THEN
    RAISE EXCEPTION '%', CASE WHEN p_on THEN 'This organisation is already on legal hold' ELSE 'This organisation is not on legal hold' END;
  END IF;
  UPDATE public.accounts
     SET legal_hold = p_on,
         legal_hold_reason = CASE WHEN p_on THEN btrim(p_reason) END,
         legal_hold_since = CASE WHEN p_on THEN NOW() END,
         legal_hold_by_admin = CASE WHEN p_on THEN v_admin END,
         updated_at = NOW()
   WHERE id = p_account_id;
  PERFORM admin.log_admin_action(v_admin, CASE WHEN p_on THEN 'organisation.legal_hold_placed' ELSE 'organisation.legal_hold_lifted' END,
                                 'account', p_account_id,
                                 jsonb_build_object('reason', btrim(p_reason), 'organisation', v_acc.account_name),
                                 jsonb_build_object('legal_hold', v_acc.legal_hold, 'legal_hold_reason', v_acc.legal_hold_reason),
                                 jsonb_build_object('legal_hold', p_on));
  RETURN jsonb_build_object('account_id', p_account_id, 'legal_hold', p_on);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_organisation_transfer_owner(
  p_account_id UUID, p_new_owner_user_id UUID, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin  UUID := public.admin_require_public_site_permission('organisations.data.transfer', p_admin_user_id);
  v_result JSONB;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_result := public.organisation_transfer_owner_apply(p_account_id, p_new_owner_user_id, btrim(p_reason));
  PERFORM admin.log_admin_action(v_admin, 'organisation.owner_transferred', 'account', p_account_id,
                                 jsonb_build_object('reason', btrim(p_reason)),
                                 jsonb_build_object('owner_user_id', v_result ->> 'previous_owner_user_id'),
                                 jsonb_build_object('owner_user_id', v_result ->> 'new_owner_user_id'));
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_organisation_data_requests(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_organisation_data_overview(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_organisation_set_legal_hold(UUID, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_organisation_transfer_owner(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

-- ── Sidebar (Users & Organisations › Organisation Data Requests) ─────────────
INSERT INTO admin.nav_nodes (id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge)
VALUES (
  'b2c3d4e5-1358-4a2b-9c3d-2e8f6a133580'::uuid,
  'users-orgs:directory:users:org-data-requests',
  'users-orgs:directory',
  'item',
  'Organisation Data Requests',
  '/users/org-data-requests',
  ARRAY[]::text[],
  ARRAY['super_admin', 'system_admin']::text[],
  5,
  TRUE,
  NULL
)
ON CONFLICT (node_key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, path = EXCLUDED.path,
  active_paths = EXCLUDED.active_paths, roles = EXCLUDED.roles, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

-- ── Field help (Admin rule 23) ───────────────────────────────────────────────
INSERT INTO admin.field_help (help_key, title, purpose, examples, format_notes, extra_notes, module_code)
VALUES
  ('admin.accounts.legal_hold', 'Legal hold',
   'While an organisation is on legal hold it cannot be deleted: a deletion request cannot be approved, and one already counting down does not delete on day 30 until the hold is lifted. Exports still work.',
   'On — since 3 Dec 2026', NULL, 'The organisation is not told about the hold.', 'admin_users'),
  ('admin.accounts.legal_hold_reason', 'Reason for the hold',
   'Why the hold is placed or lifted. It is kept in the Admin audit log.',
   '- Dispute over the contract, raised by the Head of Legal
- Request from a regulator, case reference REG-2026-014', NULL, NULL, 'admin_users'),
  ('admin.accounts.new_owner', 'New Account Owner',
   'The person who becomes the Account Owner. Only PMO Admins who work in this organisation are listed. They get the Account Owner role; billing delegates are removed, as in a normal transfer. Both the old and the new owner are told by email.',
   'Head of Operations (head.of.operations@company.example)', NULL, 'Use this when the owner has left and cannot transfer ownership themselves.', 'admin_users'),
  ('admin.accounts.transfer_reason', 'Reason for the transfer',
   'Why ownership is moved without the current owner doing it. It is kept in the Admin audit log and in the organisation’s billing audit log.',
   '- The previous owner has left; confirmed by the Head of Finance on a support ticket', NULL, NULL, 'admin_users'),
  ('admin.organisation_data_requests.reference', 'Reference',
   'The request’s ID. The customer sees the same ID on their Data export page and in the email.',
   'ODR-007', NULL, NULL, 'admin_users'),
  ('admin.organisation_data_requests.status', 'Status',
   'Queued and Being prepared: the export is being built. Ready: the owner can download it for 7 days. Expired: the files have been removed. Failed: see the error.',
   'Ready', NULL, NULL, 'admin_users')
ON CONFLICT (help_key, form_key, locale) DO UPDATE SET
  title = EXCLUDED.title, purpose = EXCLUDED.purpose, examples = EXCLUDED.examples,
  format_notes = EXCLUDED.format_notes, extra_notes = EXCLUDED.extra_notes,
  module_code = EXCLUDED.module_code, is_active = TRUE, updated_at = NOW();

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN RAISE NOTICE 'v265 applied: organisation data requests list, legal hold and ownership transfer'; END $$;
