# v219 — Background Jobs (Admin side of monorepo v1352)

**Status:** Slice 0 code complete 2026-11-23 — SQL not run (owner runs), browser check pending.
**Monorepo PRD / plan:** `E:\project-nidus\projectprd\v1352_background_jobs_PRD.md` ·
`E:\project-nidus\projectplan\v1352_background_jobs_plan.md` (authoritative checklist; this note lists the Admin part).
**Monorepo SQL:** `E:\project-nidus\SQL\v1559_background_jobs_framework.sql`, `v1560_background_jobs_existing_jobs_and_tick.sql`, `v1561_background_jobs_tests.sql`.

## Slice 0 — Admin items

- [x] `SQL/v255_background_jobs_admin.sql`: permissions `system.background_jobs.view|run|edit` (super_admin, system_admin);
      Admin jobs `admin.id_capacity_alerts` (was pg_cron `admin_id_generation_capacity_check`, v140) and
      `admin.lifecycle_archive` (was `admin_record_lifecycle_auto_archive_daily`, v99) registered with
      `owner_system = 'admin'`, old pg_cron entries removed; alert hook `admin.background_job_alert` (D4: in-app
      notification + one queued email per watcher, grouped); RPCs `public.admin_background_job_list|runs|set_enabled|run_now|rerun|replay_item`
      (reason required, audited); nav node System › Background Jobs; field help rows; Documentation Centre guide row.
- [x] `SQL/v256_background_jobs_admin_tests.sql` (one transaction, rolls back).
- [x] `packages/shared/src/backgroundJobServices.js` + Vitest.
- [x] `modules/system`: `BackgroundJobsPage.jsx` (list: sortable headers, default sort name then created, #, Card / Table
      toggle defaulting to table, search, export) and `BackgroundJobDetailPage.jsx` (routed `/system/background-jobs/:code`,
      tabs Details / Run history / Work items / Audit details, confirm dialogs with reason, back button, field help).
      No date inputs on these pages (rule 24 not triggered); dates shown D MMM YYYY 24-hour UTC.
- [x] `scripts/check-background-jobs.mjs` + `.github/workflows/background-jobs.yml`; CLAUDE.md rule 25 and the
      Security cross-schema exception; `modules/system/docs/Background_Jobs_Guide.md`.

## Slice 3 — Admin items (2026-11-27)

- [x] `SQL/v262_background_jobs_housekeeping_admin.sql`: RPCs `public.admin_background_job_housekeeping` (view),
      `…_set_run_history_retention` (D11 keep periods), `…_set_retention_target` (keep period / on-off of one
      `public.retention_targets` row), `…_set_storage_bucket` (safety window / deletion switch / on-off of one
      `public.storage_cleanup_buckets` row; deletion refused before one report-only scan) — existing permissions,
      reason required, audited; field help rows. Extends the v255 cross-schema exception (both CLAUDE.md files).
- [x] `SQL/v263_background_jobs_housekeeping_admin_tests.sql` (one transaction, rolls back).
- [x] `packages/shared/src/backgroundJobServices.js` + Vitest (housekeeping calls, validation, record picker;
      `describeCron` shows manual database jobs as “Only when run by hand”).
- [x] `modules/system`: `BackgroundJobHousekeepingPage.jsx` (`/system/background-jobs/housekeeping`, linked from the
      list page: run-history periods, log retention list, storage clean-up list — search, Card / Table toggle, #,
      export, icon-only Edit) and `BackgroundJobHousekeepingEditPage.jsx` (routed edit pages `…/run-history`,
      `…/retention/:key`, `…/storage/:key`; Details / Audit details tabs, field help, unsaved-changes guard, reason
      confirm, danger confirm when switching deletion on). No date inputs (rule 24 not triggered).
- Manual jobs (Global Template back-fill, search re-index) are monorepo catalogue rows without a schedule; Admin
  starts them with the existing Run now (reason, audited). No Admin change needed.

## Run order (after monorepo v1559, v1560, v1251 re-run, v1561)

1. `SQL/v255_background_jobs_admin.sql`
2. `SQL/v256_background_jobs_admin_tests.sql` (expects NOTICE "all Background Jobs Admin tests passed")
3. Slice 3, after monorepo v1596 and v1597: `SQL/v262_background_jobs_housekeeping_admin.sql`
4. `SQL/v263_background_jobs_housekeeping_admin_tests.sql` (expects NOTICE "v263: all housekeeping Admin tests passed (rolling back)")

## Review

Slice 0 and Slice 3: see the "Slice 0 review" and "Slice 3 review" sections of the monorepo plan.
