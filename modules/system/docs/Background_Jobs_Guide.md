# Background Jobs

**Where:** System › Background Jobs (`/system/background-jobs`)
**Permissions:** `system.background_jobs.view` (see jobs, receive alerts) · `.run` (Run now, Re-run, Replay) · `.edit` (turn on / off)
**Background:** monorepo PRD v1352 — one job catalogue, one scheduler tick every minute, one worker for queued work.

## What you see

The list shows every background job in Platform, Simulator and Admin: its schedule, whether it is on, how its
last run ended, when it runs next, and any open alert. A banner shows when the scheduler last ran; if it has
not run for more than 5 minutes, check the scheduler (see "Troubleshooting").

Use the search box, the column headings (click to sort) and the Card / Table switch as on other lists. Export
gives the visible rows in Excel, CSV, Word, PowerPoint, JSON, XML or print.

## A job’s page

Click the eye icon to open a job.

- **Details** — what the job does, its schedule (in words and as a cron expression), time basis, retry or
  queue settings and alert state. Hover a label’s ⓘ for help.
- **Run history** — the latest runs: when, result, what started it (schedule, retry, Run now, Re-run,
  worker), who and why, how long it took, how many records it processed, and the error text.
- **Work items** — for worker jobs only: queued items still waiting, running, or failed for good.
- **Audit details** — when the job was registered and last changed, and by whom.

## Actions (reason always required, all audited)

| Action | What happens |
|---|---|
| **Run now** | Database jobs start at the next scheduler minute (so long jobs never run inside your browser request). Worker jobs are queued at once. The job must be on. |
| **Turn off / Turn on** | A job that is off does not run on its schedule. Its queued work waits. |
| **Re-run** (Run history, failed / partly failed / skipped runs) | Starts a new run linked to the failed one. Fix the cause first. |
| **Replay** (Work items, failed-for-good items) | Puts one item back in the queue with a fresh set of attempts. |

## Housekeeping

**Background Jobs › Housekeeping** (button on the list page) shows how long job history and logs are kept and
which uploaded files the weekly clean-up may remove. Open a row with the pencil to change it; every change needs a
reason and is audited.

- **Run history** — how long successful and failed job runs are kept (default 90 and 365 days). Failed runs are
  kept at least as long as successful ones.
- **Log retention** — the tables the weekly *Log retention* job trims, with the date column it reads and the keep
  period. Audit and security logs start **off**: turn them on only when you have decided how long to keep them.
  New tables are added by monorepo SQL, not here. *Last run* shows what was deleted, or why a table was skipped.
- **Storage clean-up** — the buckets the weekly *Storage clean-up* job checks for files no record points to any
  more. Each bucket is **report only** until you switch *Delete orphaned files* on. Do that only after a
  report-only run's counts look right (the page refuses it before the first scan). Deleted files cannot be
  recovered; files newer than the safety window are never touched.

**Manual jobs** — *Global Template back-fill* and *Search re-index* have no schedule (“Only when run by hand”).
Start them with **Run now** on their job page.

## Alerts

When a job fails (after its retries), or was due but has not started within 15 minutes, every active Admin
user with `system.background_jobs.view` gets one in-app notification and one email. Nothing more is sent for
that job until it succeeds again; then the alert closes by itself.

## Troubleshooting

- **“The scheduler has not run yet”** — monorepo SQL v1560 has not been run, or pg_cron is off.
- **“The worker is not set up yet”** — the background-job-worker edge function or its secret is missing; worker
  jobs (AI embedding, draft expiry, tester moratorium, alert emails) wait and then show a late alert. The
  setup steps are in the monorepo guide `Documentation/Background_Jobs_v1352_Guide.md`.
- **A job fails with “Permission denied”** — the job’s own function checks permissions; read the error in
  Run history.

## For developers

New jobs are registered in SQL with `public.background_job_register` (Admin rule 25, monorepo rule 80) —
never with `cron.schedule`. Admin-owned jobs use `owner_system = 'admin'`.
