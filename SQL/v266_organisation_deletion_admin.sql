-- ============================================================================
-- v266: Organisation deletion — open on behalf, approve / reject, cancel (monorepo v1358 Slice 3a)
-- PRD: E:\project-nidus\projectprd\v1358_organisation_data_export_and_deletion_PRD.md (D1, D5, D11, D13)
-- Run after monorepo SQL v1604. Idempotent.
--
-- Extends the narrow exception of v265 (CLAUDE.md rule 34.5): Admin opens, decides and cancels organisation
-- deletion requests only through these SECURITY DEFINER RPCs, gated by organisations.data.approve, reason
-- required, audited. The work is done by the monorepo functions organisation_deletion_open_apply /
-- _decide_apply / _cancel_apply (SQL v1604): approval is refused while the organisation is on legal hold, and the
-- Account Owner must still confirm by the emailed link before anything is locked.
--   public.admin_organisation_deletion_open(account, reason)
--   public.admin_organisation_deletion_decide(request, approve, reason)
--   public.admin_organisation_deletion_cancel(request, reason)
-- The v265 list and overview are replaced to carry the deletion details.
-- ============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('organisations.data.approve', 'Approve Organisation Deletions', 'users',
   'Open, approve, reject or cancel an organisation deletion request (reason required, audited); the Account Owner still confirms by email')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name, category = EXCLUDED.category, description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES ('super_admin', 'organisations.data.approve'), ('system_admin', 'organisations.data.approve')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ── Actions ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_organisation_deletion_open(p_account_id UUID, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin  UUID := public.admin_require_public_site_permission('organisations.data.approve', p_admin_user_id);
  v_result JSONB;
BEGIN
  v_result := public.organisation_deletion_open_apply(p_account_id, p_reason, v_admin);
  PERFORM admin.log_admin_action(v_admin, 'organisation.deletion_opened', 'account', p_account_id,
                                 jsonb_build_object('reason', btrim(p_reason), 'request_id', v_result ->> 'id'), NULL, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_organisation_deletion_decide(p_request_id UUID, p_approve BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin   UUID := public.admin_require_public_site_permission('organisations.data.approve', p_admin_user_id);
  v_account UUID := (SELECT r.account_id FROM public.organisation_data_requests r WHERE r.id = p_request_id);
  v_result  JSONB;
BEGIN
  IF p_approve IS NULL THEN RAISE EXCEPTION 'Choose to approve or reject'; END IF;
  v_result := public.organisation_deletion_decide_apply(p_request_id, p_approve, p_reason, v_admin);
  PERFORM admin.log_admin_action(v_admin, CASE WHEN p_approve THEN 'organisation.deletion_approved' ELSE 'organisation.deletion_rejected' END,
                                 'account', v_account,
                                 jsonb_build_object('reason', btrim(p_reason), 'request_id', p_request_id),
                                 jsonb_build_object('status', 'pending_approval'), v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_organisation_deletion_cancel(p_request_id UUID, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin   UUID := public.admin_require_public_site_permission('organisations.data.approve', p_admin_user_id);
  v_account UUID := (SELECT r.account_id FROM public.organisation_data_requests r WHERE r.id = p_request_id);
  v_result  JSONB;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_result := public.organisation_deletion_cancel_apply(p_request_id, 'admin');
  PERFORM admin.log_admin_action(v_admin, 'organisation.deletion_cancelled', 'account', v_account,
                                 jsonb_build_object('reason', btrim(p_reason), 'request_id', p_request_id),
                                 jsonb_build_object('status', v_result ->> 'was'), v_result);
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_organisation_deletion_open(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_organisation_deletion_decide(UUID, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_organisation_deletion_cancel(UUID, TEXT, UUID) TO authenticated, service_role;

-- ── Lists with deletion details (replace v265) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_organisation_data_request_json(r public.organisation_data_requests)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'reference', NULLIF(r.request_reference, ''), 'kind', r.kind, 'status', r.status,
    'account_id', r.account_id, 'account_name', a.account_name, 'account_code', a.account_code, 'legal_hold', a.legal_hold,
    'requested_by', (SELECT COALESCE(u.display_name, u.full_name, u.email) FROM public.users u WHERE u.id = r.requested_by_user_id),
    'opened_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = r.opened_by_admin),
    'reason', r.reason,
    'decided_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = r.decided_by_admin),
    'decided_at', r.decided_at, 'decision_reason', r.decision_reason,
    'confirm_expires_at', r.confirm_expires_at, 'confirmed_at', r.confirmed_at,
    'locked_at', r.locked_at, 'deletion_due_at', r.deletion_due_at,
    'cancelled_at', r.cancelled_at, 'cancelled_by', r.cancelled_by,
    'created_at', r.created_at, 'finished_at', r.finished_at, 'expires_at', r.expires_at,
    'table_count', r.table_count, 'row_count', r.row_count, 'file_count', r.file_count, 'byte_size', r.byte_size,
    'parts', jsonb_array_length(r.files), 'error', r.last_error)
    FROM public.accounts a WHERE a.id = r.account_id;
$$;

CREATE OR REPLACE FUNCTION public.admin_organisation_data_requests(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('organisations.data.view', p_admin_user_id);
  RETURN jsonb_build_object(
    'requests', COALESCE((SELECT jsonb_agg(public.admin_organisation_data_request_json(r) ORDER BY r.created_at DESC)
                            FROM public.organisation_data_requests r), '[]'::jsonb),
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
    'locked_at', v_acc.locked_at,
    'deletion_due_at', v_acc.deletion_due_at,
    'owner', (SELECT jsonb_build_object('user_id', u.id, 'name', COALESCE(u.display_name, u.full_name, u.email), 'email', u.email)
                FROM public.users u WHERE u.id = v_acc.owner_user_id),
    'candidates', public.organisation_owner_candidates(v_acc.id),
    'requests', COALESCE((SELECT jsonb_agg(public.admin_organisation_data_request_json(r) ORDER BY r.created_at DESC)
                            FROM public.organisation_data_requests r WHERE r.account_id = v_acc.id), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_organisation_data_request_json(public.organisation_data_requests) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_organisation_data_requests(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_organisation_data_overview(UUID, UUID) TO authenticated, service_role;

-- ── Field help (Admin rule 23) ───────────────────────────────────────────────
INSERT INTO admin.field_help (help_key, title, purpose, examples, format_notes, extra_notes, module_code)
VALUES
  ('admin.organisation_data_requests.deletion_reason', 'Reason for the deletion',
   'Why the organisation should be deleted. The Account Owner gives it when asking; when you open a request on their behalf, record where the request came from.',
   '- Contract ended; written request from the Head of Finance on a support ticket', NULL,
   'The Account Owner must still confirm by the emailed link before anything is locked.', 'admin_users'),
  ('admin.organisation_data_requests.decision_reason', 'Reason for the decision',
   'Why you approve, reject or cancel the deletion. A rejection reason is shown to the Account Owner.',
   '- Approved: confirmed with the Account Owner by phone
- Rejected: the contract runs until 31 Mar 2027; please contact your account manager', NULL,
   'Approval is refused while the organisation is on legal hold.', 'admin_users'),
  ('admin.organisation_data_requests.deletion_due_at', 'Deletion date',
   'When a locked organisation is deleted permanently: 30 days after the Account Owner confirmed. A legal hold pauses it.',
   '27 Dec 2026', NULL, NULL, 'admin_users')
ON CONFLICT (help_key, form_key, locale) DO UPDATE SET
  title = EXCLUDED.title, purpose = EXCLUDED.purpose, examples = EXCLUDED.examples,
  format_notes = EXCLUDED.format_notes, extra_notes = EXCLUDED.extra_notes,
  module_code = EXCLUDED.module_code, is_active = TRUE, updated_at = NOW();

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN RAISE NOTICE 'v266 applied: organisation deletion — open, approve / reject, cancel'; END $$;
