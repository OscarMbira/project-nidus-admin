# v197 — Clone Structured Global Templates as Standards-Based (form_template domain)

## Goal
Companion to monorepo `projectplan/v827_standards_based_form_template_parity_plan.md`. The
Global Template Library shows 0 Standards-Based templates because that methodology never got
a real catalog — only `structured` and `agile` did. The original PMBOK-specific content
(`F001`-`F068`) could not be recovered from any SQL file in either repo (traced exhaustively —
see the monorepo plan for the full investigation) and appears to only have existed as live
Admin-UI-authored data. User confirmed: clone Structured's `form_template` Global Templates as
Standards-Based siblings instead (same content, re-tagged), through the **real** publish
pipeline this time.

## Why this belongs in the Admin repo, not the monorepo
A first attempt (monorepo `SQL/v828_standards_based_form_template_clone.sql`, now marked
superseded/do-not-run) hand-inserted `public.pm_template_nodes`/`form_templates` rows directly.
That bypassed the actual mechanism entirely:
- `pm_template_nodes.source_global_template_id` (added in `v765`) is how a system-synced node
  is recognised as "published from admin.global_template_library row X" — rows without it are
  invisible to Admin and excluded from its own idempotency/management logic.
- `form_templates` content for `form_template` domain is upserted **by `payload->>'template_code'`**
  via `public._sync_global_form_template_catalog` (`SQL/v777` in the monorepo) — called from
  inside `public.sync_global_template_node`, which is itself only ever meant to be invoked by
  `admin.publish_global_template` (permission-gated, requires a real admin user + publish notes).
- The real chain is: **`admin.global_template_library` row → `admin.publish_global_template()`
  → `public.sync_global_template_node()` → per-account `pm_template_nodes` + `form_templates`
  materialisation.** Cloning has to start at the top of that chain to produce a row Admin
  actually recognises as its own.

## Design
`SQL/v198_standards_based_global_template_clone.sql`:
1. Loop over every `admin.global_template_library` row where
   `domain='form_template' AND methodology='structured' AND record_status='live'`.
2. For each: derive a **deterministic** new id via `uuid_generate_v5(<fixed namespace>,
   source_id || ':standards_based')` (matches this table's existing "fixed UUIDs, ON CONFLICT
   DO UPDATE" idempotency convention, e.g. `v189_structured_forms_starting_up_directing.sql`) —
   safe to re-run.
3. Clone the row: `name` with "(Structured)" → "(Standards-Based)", `methodology=
   'standards_based'`, `payload` = shallow-merged original payload with `template_code`
   (leading `FS-` → `FD-`) and `name` overridden, `record_status='live'` (required —
   `publish_global_template` only accepts `record_status='live'` rows), everything else
   (category, description, `process_group`/`schema`/`is_active` inside payload) carried over
   unchanged — genuinely the same content, just relabelled.
4. Call `admin.publish_global_template(p_template_id, p_admin_user_id, p_notes, p_target:='both')`
   for the new row immediately — the exact same call a human clicks "Publish" to trigger,
   fanning out `pm_template_nodes` (with `source_global_template_id` correctly set) + upserting
   `form_templates`/`form_template_versions` in both `public` and `sim`, for every active account.
5. **Requires a real `admin.admin_users.id`** with `content.global_templates.publish`
   permission, plugged in before running — the script raises and refuses to proceed if left as
   the placeholder.

## Explicitly out of scope
- `process_template` domain — same reasoning as the monorepo plan: ~24-table polymorphic
  lookup, too much risk to attempt without live DB verification.
- Any other domain (`opa`, `fields`, `portfolio_template`, `programme_template`,
  `project_template`).

## Todo
- [x] `SQL/v198_standards_based_global_template_clone.sql`
- [x] User plugs in a real admin user id, reviews, and runs against Supabase
- [x] `v196_rename_pmbok_methodology_to_standards_based.sql` run first (was required —
      `chk_gtl_methodology` on the live DB still only allowed `pmbok|structured|agile` until
      this ran; v198's first attempt failed with a check-constraint violation until v196 applied)
- [ ] Confirm in the Global Template Library UI that Standards-Based templates now appear and
      are indistinguishable from Structured/Agile in how Admin manages them (edit/retire/re-publish)

## Review

**Status: v196 + v198 both executed successfully against Supabase (user-confirmed).**

En route, `v198`'s first run failed on `chk_gtl_methodology` — the live constraint hadn't yet
been migrated to allow `standards_based` (that's what `v196` does: drop constraint, backfill
`pmbok`→`standards_based`, re-add constraint with the new allowed list). Running `v196` first,
then `v198`, cleared it.

**What it does**, for every `admin.global_template_library` row where `domain='form_template',
methodology='structured', record_status='live'`:
1. Derives a deterministic child id (`uuid_generate_v5` from the source row's id) — re-running
   the script is safe, matching this table's existing fixed-UUID seed convention.
2. Clones the row: name/payload.name "(Structured)"→"(Standards-Based)",
   `payload.template_code` "FS-"→"FD-" prefix swap, `methodology='standards_based'`,
   `record_status='live'` (required for the next step), everything else (category,
   description, `payload.process_group`/`schema`/`is_active`) unchanged.
3. Calls `admin.publish_global_template(...)` on the new row immediately — the exact RPC a
   human triggers by clicking "Publish" — which fans out to `public`/`sim`
   `pm_template_nodes` + `form_templates`/`form_template_versions` for every active account,
   correctly setting `source_global_template_id` so Admin recognises and can manage these rows
   exactly like any other Global Template.

**Correction this supersedes:** the first attempt (monorepo `SQL/v828_...`) hand-built
`pm_template_nodes`/`form_templates` rows directly from the Platform side, which technically
"worked" (valid rows, would have shown up in the Template Library UI) but produced content
with no `source_global_template_id` link — invisible to Admin, unable to be managed/republished
through the normal flow, and keyed by an invented sequential code rather than the
`payload.template_code` the real sync mechanism actually uses. `v828` is marked
superseded/do-not-run in place; not deleted, so the investigation trail stays intact.

**Risk note:** built entirely from reading SQL migration history across both repos, not from a
live connection — there was no way to execute or dry-run this in this session. Please review
before running, and consider a staging/backup copy first, since `admin.publish_global_template`
itself mutates `public`/`sim` schemas across every active account.

**Left for the user:** set a real admin user id in the script, run it, and verify in the Global
Template Library UI that Standards-Based templates now appear with a working Copy action.
