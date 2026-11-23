-- ============================================================================
-- v255: Background Jobs — Admin (monorepo PRD/plan v1352 Slice 0: D3, D4, A1)
-- Admin plan note: projectplans/v219_background_jobs_admin_plan.md
--
--   * Permissions: system.background_jobs.view, .run, .edit
--   * Admin-owned catalogue rows (owner_system = 'admin'), moved off their own pg_cron entries:
--       admin.id_capacity_alerts   admin.check_id_generation_capacity_alerts()   0 */6 * * *  (was v140)
--       admin.lifecycle_archive    admin.auto_archive_expired_history()          10 3 * * *   (was v99)
--   * Alerts (D4): admin.background_job_alert(job, kind, message, run) — in-app notification to every
--     active Admin user with system.background_jobs.view, plus one queued email each (system.alert_email);
--     the monorepo runner calls it once per open alert (grouped until the job succeeds again).
--   * RPCs (v208 shape, reason required, audited):
--       public.admin_background_job_list()                       view
--       public.admin_background_job_runs(code, limit)            view
--       public.admin_background_job_set_enabled(code, on, reason) edit
--       public.admin_background_job_run_now(code, reason)        run
--       public.admin_background_job_rerun(run_id, reason)        run
--       public.admin_background_job_replay_item(item_id, reason) run
--   * admin.nav_nodes: System › Background Jobs (/system/background-jobs)
--   * admin.field_help rows for the job page; Documentation Centre guide row.
--
-- Narrow cross-schema exception (documented in both CLAUDE.md files): Admin reads public.background_jobs /
-- _runs / _queue / _settings, writes the enabled switch and run / replay requests, and registers its own
-- catalogue rows, ONLY through these SECURITY DEFINER functions.
-- Prerequisites: monorepo SQL v1559 + v1560; Admin v21 (notifications), v99, v140, v225, v250.
-- Idempotent.
-- ============================================================================

-- ── Permissions ──────────────────────────────────────────────────────────────
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('system.background_jobs.view', 'View Background Jobs', 'system',
   'See background jobs, their schedules, run history and waiting or failed work items; receive job failure alerts'),
  ('system.background_jobs.run', 'Run Background Jobs', 'system',
   'Start a job now, re-run a failed run and replay a failed work item (reason required, audited)'),
  ('system.background_jobs.edit', 'Edit Background Jobs', 'system',
   'Turn background jobs on or off (reason required, audited)')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name, category = EXCLUDED.category, description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
  ('super_admin', 'system.background_jobs.view'),
  ('super_admin', 'system.background_jobs.run'),
  ('super_admin', 'system.background_jobs.edit'),
  ('system_admin', 'system.background_jobs.view'),
  ('system_admin', 'system.background_jobs.run'),
  ('system_admin', 'system.background_jobs.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ── Alert hook (D4) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin.background_job_alert(p_job_code TEXT, p_kind TEXT, p_message TEXT, p_run_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_name   TEXT := COALESCE((SELECT j.name FROM public.background_jobs j WHERE j.code = p_job_code), p_job_code);
  v_title  TEXT;
  v_url    TEXT := '/system/background-jobs/' || p_job_code;
  v_email  BOOLEAN := COALESCE((SELECT s.alert_email_enabled FROM public.background_job_settings s WHERE s.id), TRUE);
  v_html   TEXT;
  r        RECORD;
  v_count  INTEGER := 0;
BEGIN
  v_title := CASE WHEN p_kind = 'late' THEN 'Background job late: ' ELSE 'Background job failed: ' END || v_name;
  v_html := format(
    '<p>%s</p><p>%s</p><p>You get this once until the job succeeds again. Open Admin › System › Background Jobs › %s for the run history.</p>',
    replace(replace(replace(v_title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    replace(replace(replace(COALESCE(p_message, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    p_job_code);

  FOR r IN
    SELECT au.id, au.email FROM admin.admin_users au
     WHERE au.activation_status = 'active'
       AND admin.check_admin_permission(au.id, 'system.background_jobs.view')
  LOOP
    INSERT INTO admin.notifications (recipient_admin_id, title, message, category, severity, action_url, metadata, expires_at)
    VALUES (r.id, v_title, left(COALESCE(p_message, v_title), 2000), 'system',
            CASE WHEN p_kind = 'late' THEN 'warning' ELSE 'critical' END, v_url,
            jsonb_build_object('alert_type', 'background_job', 'job_code', p_job_code, 'kind', p_kind, 'run_id', p_run_id),
            NOW() + INTERVAL '30 days');
    -- No email about the alert-email job itself (it could not be delivered anyway).
    IF v_email AND p_job_code <> 'system.alert_email' AND COALESCE(r.email, '') <> '' THEN
      PERFORM public.enqueue_background_job(
        'system.alert_email',
        jsonb_build_object('to', r.email, 'subject', v_title, 'html', v_html),
        NOW(),
        format('alert:%s:%s:%s:%s', p_job_code, p_kind, to_char(NOW() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS'), r.id),
        NULL);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION admin.background_job_alert(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

UPDATE public.background_job_settings
   SET alert_hook_function = 'admin.background_job_alert', updated_at = NOW()
 WHERE id;

-- ── Admin-owned catalogue rows; their own pg_cron entries go ────────────────
SELECT public.background_job_register(
  p_code => 'admin.id_capacity_alerts',
  p_name => 'ID generation capacity alerts',
  p_kind => 'sql',
  p_description => 'Warns Admin when an ID generation rule has used 70% or more of its possible codes.',
  p_owner_system => 'admin',
  p_sql_function => 'admin.check_id_generation_capacity_alerts',
  p_cron => '0 */6 * * *',
  p_timeout_seconds => 300
);

SELECT public.background_job_register(
  p_code => 'admin.lifecycle_archive',
  p_name => 'Admin lifecycle history auto-archive',
  p_kind => 'sql',
  p_description => 'Archives Admin record lifecycle history past its retention.',
  p_owner_system => 'admin',
  p_sql_function => 'admin.auto_archive_expired_history',
  p_cron => '10 3 * * *',
  p_timeout_seconds => 1800
);

DO $$
DECLARE
  v_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOREACH v_name IN ARRAY ARRAY['admin_id_generation_capacity_check', 'admin_record_lifecycle_auto_archive_daily'] LOOP
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = v_name;
    END LOOP;
  END IF;
END $$;

-- ── Read ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_background_job_row(p_job public.background_jobs)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
  SELECT to_jsonb(p_job) - 'run_requested_by' || jsonb_build_object(
    'next_run_at', CASE WHEN p_job.enabled AND p_job.cron IS NOT NULL
                        THEN public.background_job_next_fire(p_job.cron, NOW(), 'UTC') END,
    'waiting_items', (SELECT count(*) FROM public.background_job_queue q WHERE q.job_code = p_job.code AND q.status IN ('pending', 'running')),
    'dead_items', (SELECT count(*) FROM public.background_job_queue q WHERE q.job_code = p_job.code AND q.status = 'dead'),
    'updated_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = p_job.updated_by_admin)
  );
$$;
REVOKE ALL ON FUNCTION public.admin_background_job_row(public.background_jobs) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_background_job_list(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.background_jobs.view', p_admin_user_id);
  RETURN jsonb_build_object(
    'jobs', COALESCE((
      SELECT jsonb_agg(public.admin_background_job_row(j) ORDER BY lower(j.name), j.created_at)
        FROM public.background_jobs j
    ), '[]'::jsonb),
    'settings', (
      SELECT jsonb_build_object(
        'last_tick_at', s.last_tick_at, 'last_worker_wake_at', s.last_worker_wake_at,
        'late_grace_minutes', s.late_grace_minutes, 'success_retention_days', s.success_retention_days,
        'failure_retention_days', s.failure_retention_days, 'alerts_enabled', s.alerts_enabled,
        'alert_email_enabled', s.alert_email_enabled)
        FROM public.background_job_settings s WHERE s.id),
    'worker_configured', COALESCE((
      SELECT c.functions_base_url IS NOT NULL AND c.worker_secret IS NOT NULL
        FROM public.background_job_config c WHERE c.id), FALSE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_background_job_runs(p_job_code TEXT, p_limit INTEGER DEFAULT 100, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_job public.background_jobs;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  PERFORM public.admin_require_public_site_permission('system.background_jobs.view', p_admin_user_id);
  v_job := (SELECT j FROM public.background_jobs j WHERE j.code = p_job_code);
  IF v_job.code IS NULL THEN RAISE EXCEPTION 'Background job not found: %', p_job_code; END IF;
  RETURN jsonb_build_object(
    'job', public.admin_background_job_row(v_job),
    'runs', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.started_at DESC) FROM (
        SELECT r.id, r.status, r.triggered_by, r.reason, r.rerun_of, r.started_at, r.finished_at, r.duration_ms,
               r.records_processed, r.items_failed, r.error, r.result,
               (SELECT au.email FROM admin.admin_users au WHERE au.id = r.triggered_by_admin) AS triggered_by_email
          FROM public.background_job_runs r
         WHERE r.job_code = p_job_code
         ORDER BY r.started_at DESC
         LIMIT v_limit) x
    ), '[]'::jsonb),
    -- Waiting and failed work items only (payloads are not returned: they can hold addresses or record ids).
    'queue_items', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
        SELECT q.id, q.status, q.run_after, q.attempts, q.max_attempts, q.expires_at, q.organisation_id,
               q.last_attempt_at, q.last_error, q.finished_at, q.replay_count, q.last_replayed_at,
               q.last_replay_reason, q.created_at
          FROM public.background_job_queue q
         WHERE q.job_code = p_job_code AND q.status IN ('pending', 'running', 'dead')
         ORDER BY q.created_at DESC
         LIMIT v_limit) x
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Write ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_background_job_set_enabled(
  p_job_code TEXT, p_enabled BOOLEAN, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin  UUID := public.admin_require_public_site_permission('system.background_jobs.edit', p_admin_user_id);
  v_before BOOLEAN;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'Choose on or off'; END IF;
  v_before := (SELECT j.enabled FROM public.background_jobs j WHERE j.code = p_job_code);
  IF v_before IS NULL THEN RAISE EXCEPTION 'Background job not found: %', p_job_code; END IF;
  UPDATE public.background_jobs
     SET enabled = p_enabled, enabled_changed_at = NOW(), enabled_reason = btrim(p_reason),
         updated_by_admin = v_admin, updated_at = NOW(),
         run_requested_at = CASE WHEN p_enabled THEN run_requested_at END
   WHERE code = p_job_code;
  PERFORM admin.log_admin_action(v_admin, CASE WHEN p_enabled THEN 'background_job.enabled' ELSE 'background_job.disabled' END,
                                 'background_job', NULL,
                                 jsonb_build_object('job_code', p_job_code, 'reason', btrim(p_reason)),
                                 jsonb_build_object('enabled', v_before), jsonb_build_object('enabled', p_enabled));
  RETURN jsonb_build_object('job_code', p_job_code, 'enabled', p_enabled);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_background_job_run_now(p_job_code TEXT, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.background_jobs.run', p_admin_user_id);
  v_res   JSONB;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_res := public.background_job_request_run(p_job_code, btrim(p_reason), v_admin, NULL);
  PERFORM admin.log_admin_action(v_admin, 'background_job.run_now', 'background_job', NULL,
                                 jsonb_build_object('job_code', p_job_code, 'reason', btrim(p_reason)), NULL, v_res);
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_background_job_rerun(p_run_id UUID, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.background_jobs.run', p_admin_user_id);
  v_run   public.background_job_runs;
  v_res   JSONB;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_run := (SELECT r FROM public.background_job_runs r WHERE r.id = p_run_id);
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF v_run.status NOT IN ('failed', 'partial', 'skipped') THEN
    RAISE EXCEPTION 'Only a failed, partly failed or skipped run can be re-run (this one %)', v_run.status;
  END IF;
  v_res := public.background_job_request_run(v_run.job_code, btrim(p_reason), v_admin, p_run_id);
  PERFORM admin.log_admin_action(v_admin, 'background_job.rerun', 'background_job_run', p_run_id,
                                 jsonb_build_object('job_code', v_run.job_code, 'reason', btrim(p_reason)), NULL, v_res);
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_background_job_replay_item(p_item_id UUID, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.background_jobs.run', p_admin_user_id);
  v_res   JSONB;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_res := public.background_job_replay_item(p_item_id, btrim(p_reason), 'admin:' || v_admin::TEXT);
  PERFORM public.background_job_wake_worker();
  PERFORM admin.log_admin_action(v_admin, 'background_job.replay_item', 'background_job_item', p_item_id,
                                 jsonb_build_object('job_code', v_res ->> 'job_code', 'reason', btrim(p_reason)),
                                 jsonb_build_object('status', v_res ->> 'previous_status'), jsonb_build_object('status', 'pending'));
  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_background_job_list(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_background_job_runs(TEXT, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_background_job_set_enabled(TEXT, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_background_job_run_now(TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_background_job_rerun(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_background_job_replay_item(UUID, TEXT, UUID) TO authenticated, service_role;

-- ── Navigation: System › Background Jobs ─────────────────────────────────────
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
)
VALUES (
    'a1b2c3d4-2551-4a1a-9c2a-1d7e5b925501'::uuid,
    'system-security:system:system:background-jobs',
    'system-security:system',
    'item',
    'Background Jobs',
    '/system/background-jobs',
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    196,
    TRUE,
    NULL
)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

-- ── Field help (Admin rule 23) ───────────────────────────────────────────────
INSERT INTO admin.field_help (help_key, title, purpose, examples, format_notes, extra_notes, module_code)
VALUES
  ('admin.background_jobs.code', 'Job code', 'The fixed code that names this job in the catalogue, the worker and the audit log.', 'trial.expiry_check', 'Area, a dot, then the job.', NULL, 'admin_system'),
  ('admin.background_jobs.description', 'What it does', 'A short description of the work this job does.', 'Locks projects whose free trial has ended.', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.owner_system', 'Owner', 'Which system the job belongs to. Admin jobs are registered by Admin SQL.', 'Platform', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.kind', 'Runs as', 'How the job runs: a database function, or a handler in the background worker that takes items from the work queue.', 'Database function', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.cron', 'Schedule', 'When the job runs, as a cron expression (minute, hour, day of month, month, day of week). Empty means it only runs when work is queued or someone runs it.', '0 0 * * * (every day at midnight)', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.time_basis', 'Time basis', 'Whether the schedule is read in UTC or in each organisation’s own time zone.', 'UTC', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.enabled', 'Status', 'Whether the job runs. A job that is off does not run on its schedule and cannot be run by hand.', 'On', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.next_run_at', 'Next run', 'When the schedule next starts the job (UTC). Shown only when the job is on and has a schedule.', '24 Nov 2026 00:00', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.last_success_at', 'Last success', 'When the job last finished without errors.', '23 Nov 2026 00:00', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.alert_open', 'Alert', 'Whether an alert is open for this job. You are told once when it fails or is late, and again only after it has succeeded in between.', 'Failed', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.timeout_seconds', 'Time-out', 'How long a run may take before it counts as stopped.', '600 seconds', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.max_retries', 'Retries', 'For database jobs: how many times a failed run is tried again before an alert is sent.', '1', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.retry_delay_seconds', 'Retry delay', 'For database jobs: how long to wait before trying a failed run again.', '300 seconds', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.max_attempts', 'Attempts per item', 'For worker jobs: how many times one work item is tried before it is marked failed for good.', '5', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.backoff_schedule', 'Wait between attempts', 'For worker jobs: how long a failed item waits before each new attempt.', '1 min, 5 min, 30 min, 2 h', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.batch_size', 'Batch size', 'For worker jobs: the most items the worker takes for this job at once.', '50', NULL, NULL, 'admin_system'),
  ('admin.background_jobs.per_org_batch_cap', 'Per organisation', 'For worker jobs: the most items from one organisation in one batch, so one busy organisation cannot hold up the others. Empty means no limit.', '10', NULL, NULL, 'admin_system')
ON CONFLICT (help_key, form_key, locale) DO UPDATE SET
  title = EXCLUDED.title, purpose = EXCLUDED.purpose, examples = EXCLUDED.examples,
  format_notes = EXCLUDED.format_notes, extra_notes = EXCLUDED.extra_notes,
  module_code = EXCLUDED.module_code, is_active = TRUE, updated_at = NOW();

-- ── Documentation Centre guide ───────────────────────────────────────────────
INSERT INTO admin.documentation_guides (
    id, guide_id, title, file_name, category, module, description, target_roles, sort_order
)
VALUES (
    'b7593001-0255-4001-8255-000000000001'::uuid,
    'background-jobs-guide',
    'Background Jobs',
    'Background_Jobs_Guide.md',
    'Reference',
    'system',
    'See every background job, its schedule and run history; run, re-run, turn on or off and replay failed items',
    ARRAY['super_admin', 'system_admin']::text[],
    3
)
ON CONFLICT (guide_id) DO UPDATE SET
    title = EXCLUDED.title,
    file_name = EXCLUDED.file_name,
    category = EXCLUDED.category,
    module = EXCLUDED.module,
    description = EXCLUDED.description,
    target_roles = EXCLUDED.target_roles,
    sort_order = EXCLUDED.sort_order;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN RAISE NOTICE 'v255 applied: Background Jobs — permissions, Admin jobs in the catalogue, alerts, RPCs, page'; END $$;

-- Checks
SELECT code, owner_system, cron, enabled FROM public.background_jobs WHERE owner_system = 'admin' ORDER BY code;
SELECT alert_hook_function FROM public.background_job_settings WHERE id;
