-- ============================================================================
-- v256 tests: Background Jobs Admin RPCs and alert hook (monorepo v1352 Slice 0). Run after v255.
-- One transaction that ROLLS BACK: nothing is kept. Acts as the oldest active super admin through the
-- service-role path of admin_require_public_site_permission (as server-side jobs do).
--
--   T1 list returns monorepo and Admin catalogue rows plus settings
--   T2 a reason is required; an admin without the permission is refused
--   T3 turn off with a reason → audited; Run now refused while off
--   T4 turn on, Run now → requested (SQL job), audited
--   T5 runs RPC returns the job, its runs and its waiting / failed items
--   T6 alert hook → in-app notification per watcher, alert emails queued
-- ============================================================================

BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', TRUE);

DO $$
DECLARE
  v_admin   UUID := (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1);
  v_res     JSONB;
  v_refused BOOLEAN;
  v_count   INTEGER;
BEGIN
  IF v_admin IS NULL THEN
    RAISE NOTICE 'v256 skipped: no active super admin';
    RETURN;
  END IF;

  -- T1
  v_res := public.admin_background_job_list(v_admin);
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'jobs') j WHERE j ->> 'code' = 'admin.id_capacity_alerts'), 'T1 Admin job listed';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'jobs') j WHERE j ->> 'code' = 'trial.expiry_check'), 'T1 monorepo job listed';
  ASSERT v_res -> 'settings' ? 'last_tick_at', 'T1 settings returned';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'jobs') j WHERE j ? 'run_requested_by'), 'T1 no internal admin ids';
  RAISE NOTICE 'PASS T1 list';

  -- T2
  v_refused := FALSE;
  BEGIN
    PERFORM public.admin_background_job_set_enabled('trial.expiry_check', FALSE, '   ', v_admin);
  EXCEPTION WHEN OTHERS THEN v_refused := TRUE;
  END;
  ASSERT v_refused, 'T2 reason required';
  v_refused := FALSE;
  BEGIN
    PERFORM public.admin_background_job_list(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_refused := TRUE;
  END;
  ASSERT v_refused, 'T2 unknown admin refused';
  RAISE NOTICE 'PASS T2 reason and permission';

  -- T3
  PERFORM public.admin_background_job_set_enabled('trial.expiry_check', FALSE, 'Pause during the owner check', v_admin);
  ASSERT NOT (SELECT enabled FROM public.background_jobs WHERE code = 'trial.expiry_check'), 'T3 turned off';
  ASSERT EXISTS (SELECT 1 FROM admin.admin_audit_log WHERE action = 'background_job.disabled' AND admin_user_id = v_admin
                   AND target_details ->> 'job_code' = 'trial.expiry_check'), 'T3 audited';
  v_refused := FALSE;
  BEGIN
    PERFORM public.admin_background_job_run_now('trial.expiry_check', 'Try while off', v_admin);
  EXCEPTION WHEN OTHERS THEN v_refused := TRUE;
  END;
  ASSERT v_refused, 'T3 Run now refused while off';
  RAISE NOTICE 'PASS T3 turn off';

  -- T4
  PERFORM public.admin_background_job_set_enabled('trial.expiry_check', TRUE, 'Owner check finished', v_admin);
  UPDATE public.background_jobs SET run_requested_at = NULL WHERE code = 'trial.expiry_check';
  v_res := public.admin_background_job_run_now('trial.expiry_check', 'Check after moving to the catalogue', v_admin);
  ASSERT v_res ->> 'status' = 'requested', 'T4 SQL job requested for the next tick: ' || v_res::TEXT;
  ASSERT (SELECT run_request_reason FROM public.background_jobs WHERE code = 'trial.expiry_check') = 'Check after moving to the catalogue', 'T4 reason kept';
  ASSERT EXISTS (SELECT 1 FROM admin.admin_audit_log WHERE action = 'background_job.run_now' AND admin_user_id = v_admin), 'T4 audited';
  RAISE NOTICE 'PASS T4 run now';

  -- T5
  v_res := public.admin_background_job_runs('trial.expiry_check', 20, v_admin);
  ASSERT v_res -> 'job' ->> 'code' = 'trial.expiry_check' AND jsonb_typeof(v_res -> 'runs') = 'array'
         AND jsonb_typeof(v_res -> 'queue_items') = 'array', 'T5 detail payload';
  RAISE NOTICE 'PASS T5 runs';

  -- T6
  v_count := admin.background_job_alert('trial.expiry_check', 'failed', 'Test failure text', NULL);
  ASSERT v_count >= 1, 'T6 at least one watcher (the super admin)';
  ASSERT EXISTS (SELECT 1 FROM admin.notifications WHERE recipient_admin_id = v_admin
                   AND metadata ->> 'alert_type' = 'background_job' AND metadata ->> 'job_code' = 'trial.expiry_check'), 'T6 in-app notification';
  IF (SELECT alert_email_enabled FROM public.background_job_settings WHERE id) THEN
    ASSERT EXISTS (SELECT 1 FROM public.background_job_queue WHERE job_code = 'system.alert_email'
                     AND payload ->> 'subject' LIKE 'Background job failed:%'), 'T6 alert email queued';
  END IF;
  RAISE NOTICE 'PASS T6 alert hook';

  RAISE NOTICE 'v256: all Background Jobs Admin tests passed (rolling back)';
END $$;

ROLLBACK;
