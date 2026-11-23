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
