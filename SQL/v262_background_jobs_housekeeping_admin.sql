-- ============================================================================
-- v262: Background Jobs — housekeeping settings (monorepo PRD/plan v1352 Slice 3: D11, A1.5, 3.2)
-- Admin plan note: projectplans/v219_background_jobs_admin_plan.md (Slice 3 section)
--
--   * RPCs (v208 shape, reason required, audited; existing permissions from v255):
--       public.admin_background_job_housekeeping()                                       view
--       public.admin_background_job_set_run_history_retention(success, failure, reason)  edit   (D11)
--       public.admin_background_job_set_retention_target(schema, table, days, on, reason) edit  (A1.5)
--       public.admin_background_job_set_storage_bucket(bucket, days, delete_on, on, reason) edit (3.2)
--   * admin.field_help rows for the housekeeping pages (Admin rule 23).
--
-- Narrow cross-schema exception (extends the v255 one, documented in both CLAUDE.md files): Admin reads
-- public.retention_targets, public.storage_cleanup_buckets / _references and the run-history keep periods of
-- public.background_job_settings, and changes only the keep period / on-off of a retention target, the safety
-- window / deletion switch / on-off of a Storage bucket and the two run-history keep periods — ONLY through
-- these SECURITY DEFINER functions. Admin cannot add targets or reference columns (versioned SQL only).
-- Prerequisites: monorepo SQL v1596 (tables); Admin v255. Idempotent.
-- ============================================================================

-- ── Read ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_background_job_housekeeping(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('system.background_jobs.view', p_admin_user_id);
  IF to_regclass('public.retention_targets') IS NULL OR to_regclass('public.storage_cleanup_buckets') IS NULL THEN
    RAISE EXCEPTION 'Run monorepo SQL v1596 first (retention and storage clean-up tables are missing)';
  END IF;
  RETURN jsonb_build_object(
    'run_history', (
      SELECT jsonb_build_object(
        'success_retention_days', s.success_retention_days, 'failure_retention_days', s.failure_retention_days,
        'updated_at', s.updated_at,
        'updated_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = s.updated_by_admin))
        FROM public.background_job_settings s WHERE s.id),
    'retention_targets', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) - 'updated_by_admin' || jsonb_build_object(
               'target_key', t.table_schema || '.' || t.table_name,
               'problem', public.retention_target_problem(t.table_schema, t.table_name, t.date_column, t.status_column),
               'updated_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = t.updated_by_admin))
             ORDER BY lower(t.table_schema || '.' || t.table_name), t.created_at)
        FROM public.retention_targets t), '[]'::jsonb),
    'storage_buckets', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) - 'updated_by_admin' || jsonb_build_object(
               'references', COALESCE((SELECT jsonb_agg(r.ref_schema || '.' || r.ref_table || '.' || r.ref_column
                                                        ORDER BY r.ref_schema, r.ref_table, r.ref_column)
                                         FROM public.storage_cleanup_references r WHERE r.bucket_id = b.bucket_id), '[]'::jsonb),
               'updated_by_email', (SELECT au.email FROM admin.admin_users au WHERE au.id = b.updated_by_admin))
             ORDER BY lower(b.bucket_id), b.created_at)
        FROM public.storage_cleanup_buckets b), '[]'::jsonb)
  );
END;
$$;

-- ── Write ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_background_job_set_run_history_retention(
  p_success_days INTEGER, p_failure_days INTEGER, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin  UUID := public.admin_require_public_site_permission('system.background_jobs.edit', p_admin_user_id);
  v_before JSONB;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_success_days IS NULL OR p_success_days NOT BETWEEN 7 AND 3650 THEN
    RAISE EXCEPTION 'Keep successful runs for 7 to 3650 days';
  END IF;
  IF p_failure_days IS NULL OR p_failure_days NOT BETWEEN 7 AND 3650 THEN
    RAISE EXCEPTION 'Keep failed runs for 7 to 3650 days';
  END IF;
  IF p_failure_days < p_success_days THEN
    RAISE EXCEPTION 'Failed runs must be kept at least as long as successful runs';
  END IF;
  v_before := (SELECT jsonb_build_object('success_retention_days', s.success_retention_days,
                                         'failure_retention_days', s.failure_retention_days)
                 FROM public.background_job_settings s WHERE s.id);
  UPDATE public.background_job_settings
     SET success_retention_days = p_success_days, failure_retention_days = p_failure_days,
         updated_at = NOW(), updated_by_admin = v_admin
   WHERE id;
  PERFORM admin.log_admin_action(v_admin, 'background_job.retention_updated', 'background_job_settings', NULL,
                                 jsonb_build_object('reason', btrim(p_reason)), v_before,
                                 jsonb_build_object('success_retention_days', p_success_days,
                                                    'failure_retention_days', p_failure_days));
  RETURN jsonb_build_object('success_retention_days', p_success_days, 'failure_retention_days', p_failure_days);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_background_job_set_retention_target(
  p_table_schema TEXT, p_table_name TEXT, p_retain_days INTEGER, p_is_active BOOLEAN, p_reason TEXT,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.background_jobs.edit', p_admin_user_id);
  v_row   public.retention_targets;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_retain_days IS NULL OR p_retain_days NOT BETWEEN 7 AND 3650 THEN RAISE EXCEPTION 'Keep rows for 7 to 3650 days'; END IF;
  IF p_is_active IS NULL THEN RAISE EXCEPTION 'Choose on or off'; END IF;
  v_row := (SELECT t FROM public.retention_targets t WHERE t.table_schema = p_table_schema AND t.table_name = p_table_name);
  IF v_row.table_name IS NULL THEN RAISE EXCEPTION 'Retention target not found: %.%', p_table_schema, p_table_name; END IF;
  UPDATE public.retention_targets
     SET retain_days = p_retain_days, is_active = p_is_active, change_reason = btrim(p_reason),
         updated_at = NOW(), updated_by_admin = v_admin
   WHERE table_schema = p_table_schema AND table_name = p_table_name;
  PERFORM admin.log_admin_action(v_admin, 'background_job.retention_target_updated', 'retention_target', NULL,
                                 jsonb_build_object('target', p_table_schema || '.' || p_table_name, 'reason', btrim(p_reason)),
                                 jsonb_build_object('retain_days', v_row.retain_days, 'is_active', v_row.is_active),
                                 jsonb_build_object('retain_days', p_retain_days, 'is_active', p_is_active));
  RETURN jsonb_build_object('target', p_table_schema || '.' || p_table_name, 'retain_days', p_retain_days, 'is_active', p_is_active);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_background_job_set_storage_bucket(
  p_bucket_id TEXT, p_min_age_days INTEGER, p_delete_enabled BOOLEAN, p_is_active BOOLEAN, p_reason TEXT,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('system.background_jobs.edit', p_admin_user_id);
  v_row   public.storage_cleanup_buckets;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_min_age_days IS NULL OR p_min_age_days NOT BETWEEN 7 AND 3650 THEN
    RAISE EXCEPTION 'The safety window is 7 to 3650 days';
  END IF;
  IF p_delete_enabled IS NULL OR p_is_active IS NULL THEN RAISE EXCEPTION 'Choose on or off'; END IF;
  v_row := (SELECT b FROM public.storage_cleanup_buckets b WHERE b.bucket_id = p_bucket_id);
  IF v_row.bucket_id IS NULL THEN RAISE EXCEPTION 'Storage bucket not found in the clean-up list: %', p_bucket_id; END IF;
  IF p_delete_enabled AND NOT v_row.delete_enabled AND v_row.last_scanned_at IS NULL THEN
    RAISE EXCEPTION 'Let the clean-up job scan this bucket once (report only) before switching deletion on';
  END IF;
  UPDATE public.storage_cleanup_buckets
     SET min_age_days = p_min_age_days, delete_enabled = p_delete_enabled, is_active = p_is_active,
         change_reason = btrim(p_reason), updated_at = NOW(), updated_by_admin = v_admin
   WHERE bucket_id = p_bucket_id;
  PERFORM admin.log_admin_action(v_admin,
                                 CASE WHEN p_delete_enabled AND NOT v_row.delete_enabled THEN 'background_job.storage_delete_enabled'
                                      ELSE 'background_job.storage_bucket_updated' END,
                                 'storage_cleanup_bucket', NULL,
                                 jsonb_build_object('bucket', p_bucket_id, 'reason', btrim(p_reason)),
                                 jsonb_build_object('min_age_days', v_row.min_age_days, 'delete_enabled', v_row.delete_enabled,
                                                    'is_active', v_row.is_active),
                                 jsonb_build_object('min_age_days', p_min_age_days, 'delete_enabled', p_delete_enabled,
                                                    'is_active', p_is_active));
  RETURN jsonb_build_object('bucket', p_bucket_id, 'min_age_days', p_min_age_days, 'delete_enabled', p_delete_enabled,
                            'is_active', p_is_active);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_background_job_housekeeping(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_background_job_set_run_history_retention(INTEGER, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_background_job_set_retention_target(TEXT, TEXT, INTEGER, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_background_job_set_storage_bucket(TEXT, INTEGER, BOOLEAN, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

-- ── Field help (Admin rule 23) ───────────────────────────────────────────────
INSERT INTO admin.field_help (help_key, title, purpose, examples, format_notes, extra_notes, module_code)
VALUES
  ('admin.background_job_settings.success_retention_days', 'Keep successful runs',
   'How many days the history of successful and skipped job runs, and finished work items, is kept before the log retention job deletes it.',
   '90', 'Whole days, 7 to 3650.', NULL, 'admin_system'),
  ('admin.background_job_settings.failure_retention_days', 'Keep failed runs',
   'How many days failed and partly failed runs, and work items that failed for good, are kept. Keep them at least as long as successful runs.',
   '365', 'Whole days, 7 to 3650.', NULL, 'admin_system'),
  ('admin.retention_targets.target_key', 'Table',
   'The table the log retention job trims. New tables are added by versioned SQL, not here.',
   'public.email_logs', NULL, NULL, 'admin_system'),
  ('admin.retention_targets.date_column', 'Date column',
   'The column whose date decides how old a row is.',
   'created_at', NULL, NULL, 'admin_system'),
  ('admin.retention_targets.status_filter', 'Only rows with',
   'When set, only rows with one of these values are deleted; other rows are kept whatever their age.',
   'is_read: true', NULL, NULL, 'admin_system'),
  ('admin.retention_targets.retain_days', 'Keep for',
   'How many days rows are kept before the weekly log retention job deletes them.',
   '180', 'Whole days, 7 to 3650.', NULL, 'admin_system'),
  ('admin.retention_targets.is_active', 'Status',
   'Whether the log retention job trims this table. Audit and security logs start off until you decide.',
   'On', NULL, NULL, 'admin_system'),
  ('admin.retention_targets.last_result', 'Last run',
   'What the log retention job did with this table last time: rows deleted, skipped (and why) or an error.',
   'ok — 120 rows deleted', NULL, NULL, 'admin_system'),
  ('admin.storage_cleanup_buckets.bucket_id', 'Bucket',
   'The Storage bucket the clean-up job checks for files that no record points to any more.',
   'risk-attachments', NULL, NULL, 'admin_system'),
  ('admin.storage_cleanup_buckets.references', 'Checked against',
   'The columns that hold file paths for this bucket. A file is only treated as orphaned when none of them point to it.',
   'public.risk_attachments.file_path', NULL, NULL, 'admin_system'),
  ('admin.storage_cleanup_buckets.min_age_days', 'Safety window',
   'Files newer than this are never touched, so an upload whose record is still being saved is safe.',
   '30', 'Whole days, 7 to 3650.', NULL, 'admin_system'),
  ('admin.storage_cleanup_buckets.delete_enabled', 'Delete orphaned files',
   'Off: the job only counts orphaned files. On: it deletes them, up to the per-run limit. Check the counts from at least one report-only run first.',
   'Off', NULL, 'Deleted files cannot be recovered.', 'admin_system'),
  ('admin.storage_cleanup_buckets.is_active', 'Status',
   'Whether the clean-up job looks at this bucket at all.',
   'On', NULL, NULL, 'admin_system'),
  ('admin.storage_cleanup_buckets.last_result', 'Last scan',
   'What the last clean-up run found in this bucket: files past the safety window, orphaned files and files deleted.',
   '12 orphaned of 840 — report only', NULL, NULL, 'admin_system')
ON CONFLICT (help_key, form_key, locale) DO UPDATE SET
  title = EXCLUDED.title, purpose = EXCLUDED.purpose, examples = EXCLUDED.examples,
  format_notes = EXCLUDED.format_notes, extra_notes = EXCLUDED.extra_notes,
  module_code = EXCLUDED.module_code, is_active = TRUE, updated_at = NOW();

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN RAISE NOTICE 'v262 applied: Background Jobs housekeeping settings (retention, storage clean-up)'; END $$;
