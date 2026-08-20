# v190 — Heal Global Template publish (missing per-target sync columns)

## Problem
Publish to Platform / Publish to Simulator on Global Template Library returns HTTP 400 for every template.

Live RPC error (confirmed against Supabase):
`column "platform_synced_at" does not exist` (SQLSTATE 42703)

## Root cause
`admin.publish_global_template` (from Admin `v175` / later `v184`/`v185`) UPDATEs:

- `platform_synced_at` / `platform_synced_version`
- `sim_synced_at` / `sim_synced_version`

Those columns were introduced in `SQL/v175_publish_global_template_target.sql`, but in this environment the **ALTER TABLE was never applied** while later migrations still replaced the function body. Sync into Platform/Simulator can succeed inside the RPC; the final stamp UPDATE then fails and PostgREST returns 400.

Also confirmed: a stale 3-arg overload of `publish_global_template` remains alongside the 4-arg `(…, p_target)` version, which makes PostgREST ambiguous when `p_target` is omitted.

## Todo
1. [x] Add `SQL/v190_heal_global_template_per_target_sync_columns.sql` — ADD COLUMN IF NOT EXISTS for the four per-target columns, backfill from legacy `synced_*`, DROP 3-arg overload, re-GRANT 4-arg.
2. [ ] Apply `v190` to the target Supabase project (DB password in Admin `.env` is invalid for CLI — use SQL Editor).
3. [x] Frontend: fail-fast bulk publish on structural RPC errors + surface real Postgres message (stops 254× console 400 spam).
4. [x] Unit test for fail-fast abort.
5. [ ] Verify after SQL apply: publish one live row with `p_target='platform'` succeeds; Downstream badges update.

## Apply
```bash
cd E:\project-nidus-admin
node scripts/run-admin-sql.js SQL/v190_heal_global_template_per_target_sync_columns.sql
```
Or paste the file into Supabase SQL Editor if CLI DB password is unavailable.

## Review

### Root cause (confirmed live)
`publish_global_template(..., p_target='platform')` with a real admin id returns:
`column "platform_synced_at" does not exist` (42703).

Column inventory on `admin.global_template_library`:
- `synced_at` / `synced_version` — present
- `methodology` — present (v185 applied)
- `platform_synced_at` / `platform_synced_version` / `sim_synced_at` / `sim_synced_version` — **missing** (v175 ALTER never applied)

So the function body from v175+ is live, but the supporting columns are not. Downstream sync can run; the stamp UPDATE fails → HTTP 400 for every bulk row.

Also present: stale 3-arg overload of `publish_global_template` (PostgREST ambiguity when `p_target` omitted).

### What shipped
1. **Admin `SQL/v190_heal_global_template_per_target_sync_columns.sql`** — idempotent heal + drop 3-arg overload.
2. **`globalTemplateServices.js`** — bulk publish aborts on structural errors (missing column, overload ambiguity, permission, missing notes/admin).
3. **`GlobalTemplateLibraryList.jsx`** — toast shows the real RPC error / abort reason.
4. **Test** — fail-fast asserts a single RPC call then abort.

### Blocked
Could not apply `v190` via `scripts/run-admin-sql.js` — `SUPABASE_DB_PASSWORD` fails auth. Operator must run the SQL in the Supabase SQL Editor (or fix the DB password and re-run the script). Until then, publish buttons will still 400 (but now fail-fast with a clear message instead of flooding the console).
