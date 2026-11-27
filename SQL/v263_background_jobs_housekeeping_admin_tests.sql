-- ============================================================================
-- v263 tests: Background Jobs housekeeping RPCs (monorepo v1352 Slice 3). Run after monorepo v1596 and v262.
-- One transaction that ROLLS BACK: nothing is kept. Acts as the oldest active super admin through the
-- service-role path of admin_require_public_site_permission (as v256 does).
--
--   H1 the housekeeping read returns run-history periods, retention targets and Storage buckets
--   H2 a reason is required; an unknown admin is refused; bad values are refused
--   H3 run-history keep periods change and are audited
--   H4 a retention target's keep period / on-off change and are audited; unknown targets refused
--   H5 a Storage bucket: deletion cannot be switched on before one scan; after a scan it can, audited
-- ============================================================================

BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', TRUE);

DO $$
DECLARE
  v_admin   UUID := (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1);
  v_res     JSONB;
  v_refused BOOLEAN;
BEGIN
  IF v_admin IS NULL THEN
    RAISE NOTICE 'v263 skipped: no active super admin';
    RETURN;
  END IF;

  -- H1
  v_res := public.admin_background_job_housekeeping(v_admin);
  ASSERT v_res #>> '{run_history,success_retention_days}' IS NOT NULL, 'H1 run history returned';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'retention_targets') t
                  WHERE t ->> 'target_key' = 'public.background_job_markers'), 'H1 retention target listed';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'storage_buckets') b
                  WHERE b ->> 'bucket_id' = 'risk-attachments' AND jsonb_array_length(b -> 'references') >= 1), 'H1 bucket with references';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'retention_targets') t WHERE t ? 'updated_by_admin'), 'H1 no internal admin ids';
  RAISE NOTICE 'PASS H1 read';

  -- H2
  v_refused := FALSE;
  BEGIN PERFORM public.admin_background_job_set_run_history_retention(90, 365, '  ', v_admin);
  EXCEPTION WHEN OTHERS THEN v_refused := TRUE; END;
  ASSERT v_refused, 'H2 reason required';
  v_refused := FALSE;
  BEGIN PERFORM public.admin_background_job_housekeeping(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_refused := TRUE; END;
  ASSERT v_refused, 'H2 unknown admin refused';
  v_refused := FALSE;
  BEGIN PERFORM public.admin_background_job_set_run_history_retention(200, 100, 'Shorter failures', v_admin);
  EXCEPTION WHEN OTHERS THEN v_refused := TRUE; END;
  ASSERT v_refused, 'H2 failures kept at least as long as successes';
  v_refused := FALSE;
  BEGIN PERFORM public.admin_background_job_set_retention_target('public', 'email_logs', 1, TRUE, 'Too short', v_admin);
  EXCEPTION WHEN OTHERS THEN v_refused := TRUE; END;
  ASSERT v_refused, 'H2 keep period range enforced';
  RAISE NOTICE 'PASS H2 reason, permission and ranges';

  -- H3
  PERFORM public.admin_background_job_set_run_history_retention(120, 400, 'Owner asked for longer history', v_admin);
  ASSERT (SELECT success_retention_days FROM public.background_job_settings WHERE id) = 120, 'H3 success days saved';
  ASSERT (SELECT failure_retention_days FROM public.background_job_settings WHERE id) = 400, 'H3 failure days saved';
  ASSERT EXISTS (SELECT 1 FROM admin.admin_audit_log WHERE action = 'background_job.retention_updated' AND admin_user_id = v_admin),
    'H3 audited';
  RAISE NOTICE 'PASS H3 run history';

  -- H4
  PERFORM public.admin_background_job_set_retention_target('public', 'email_logs', 200, FALSE, 'Pause while checking volumes', v_admin);
  ASSERT (SELECT retain_days = 200 AND NOT is_active FROM public.retention_targets
           WHERE table_schema = 'public' AND table_name = 'email_logs'), 'H4 target saved';
  ASSERT EXISTS (SELECT 1 FROM admin.admin_audit_log WHERE action = 'background_job.retention_target_updated'
                   AND target_details ->> 'target' = 'public.email_logs'), 'H4 audited';
  v_refused := FALSE;
  BEGIN PERFORM public.admin_background_job_set_retention_target('public', 'v263_no_target', 90, TRUE, 'Test', v_admin);
  EXCEPTION WHEN OTHERS THEN v_refused := TRUE; END;
  ASSERT v_refused, 'H4 unknown target refused (targets are added by SQL only)';
  RAISE NOTICE 'PASS H4 retention target';

  -- H5
  UPDATE public.storage_cleanup_buckets SET last_scanned_at = NULL, delete_enabled = FALSE WHERE bucket_id = 'risk-attachments';
  v_refused := FALSE;
  BEGIN PERFORM public.admin_background_job_set_storage_bucket('risk-attachments', 30, TRUE, TRUE, 'Counts look right', v_admin);
  EXCEPTION WHEN OTHERS THEN v_refused := TRUE; END;
  ASSERT v_refused, 'H5 deletion refused before a report-only scan';
  UPDATE public.storage_cleanup_buckets SET last_scanned_at = NOW() WHERE bucket_id = 'risk-attachments';
  PERFORM public.admin_background_job_set_storage_bucket('risk-attachments', 45, TRUE, TRUE, 'Counts look right', v_admin);
  ASSERT (SELECT delete_enabled AND min_age_days = 45 FROM public.storage_cleanup_buckets WHERE bucket_id = 'risk-attachments'),
    'H5 deletion switched on';
  ASSERT EXISTS (SELECT 1 FROM admin.admin_audit_log WHERE action = 'background_job.storage_delete_enabled'
                   AND target_details ->> 'bucket' = 'risk-attachments'), 'H5 audited as deletion switched on';
  RAISE NOTICE 'PASS H5 storage bucket';

  RAISE NOTICE 'v263: all housekeeping Admin tests passed (rolling back)';
END $$;

ROLLBACK;
