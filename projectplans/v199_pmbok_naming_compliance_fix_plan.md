# v199 — Remove "PMBOK" from Standards-Based project_template display names

## Goal
User spotted 5 Standards-Based `project_template` Global Templates in the Platform Template
Library still displaying literal "PMBOK" text in their name (e.g. "PMBOK Project Charter Gate",
"Digital Delivery Project (PMBOK)"). PMBOK(R) is a PMI trademark — CLAUDE.md rule 26/27 already
excludes PRINCE2 for the same reason; PMBOK belongs in the same category and was missed when
`v192_project_template_methodology_completeness_seed.sql` seeded these rows (that file's own
header even says "Rule 27: labels use Structured (never PRINCE2)" but didn't extend the same
rule to PMBOK for these 5 names).

Note: the *internal* `methodology` enum value `'pmbok'` (column value, not a display string) is
a separate, older concern already handled by companion plan
`v196_pmbok_internal_identifier_rename_plan.md` / monorepo `v798` — this fix is purely about the
user-visible `name`/`description` text on 5 specific rows, not the enum.

## Affected rows (admin.global_template_library, domain=project_template)
| id | old name | new name |
|---|---|---|
| a1850000-0000-4000-8000-000000000001 | Digital Delivery Project (PMBOK) | Digital Delivery Project (Standards-Based) |
| a1920000-0000-4000-8000-000000000011 | PMBOK Project Charter Gate | Standards-Based Project Charter Gate |
| a1920000-0000-4000-8000-000000000012 | PMBOK Project Management Plan | Standards-Based Project Management Plan |
| a1920000-0000-4000-8000-000000000014 | PMBOK Performance Control | Standards-Based Performance Control |
| a1920000-0000-4000-8000-000000000015 | PMBOK Project Closure | Standards-Based Project Closure |

## Design
Two parts, matching the v196/v198 precedent (fix source seed + republish already-live rows):
1. **Source fix**: edited `v192_project_template_methodology_completeness_seed.sql` in place —
   its `name`/`description` literals for these 5 rows no longer contain "PMBOK". Safe to edit
   since the file is idempotent (fixed UUIDs, `ON CONFLICT DO UPDATE`) and any *future* fresh
   environment that re-runs it now gets the corrected text directly; this does not touch rows
   already live in this session's database (SQL files aren't re-run automatically).
2. **Live-data fix**: new `SQL/v199_pmbok_naming_compliance_fix.sql` — `UPDATE
   admin.global_template_library` for the same 5 ids, then `admin.publish_global_template(...)`
   on each immediately after. Republishing (not just updating admin's own catalog row) matters
   because `public.sync_global_template_node` / `sim.sync_global_template_node`'s per-account
   inner function looks up the existing `pm_template_nodes` row by `source_global_template_id`
   and **updates** it in place when found (confirmed in
   `SQL/v785_project_template_domain_and_methodology.sql`'s
   `_sync_global_template_node_for_account`) — so every account that already copied one of these
   5 templates gets its already-materialised row's name/description corrected too, not just
   new copies going forward.

## Explicitly out of scope
- A second "PMBOK" instance found while investigating, in the *unrelated* `process_template`
  domain: `public.project_charters` / `sim.project_charters` seed row description ("Standard
  PMBOK project charter for authorising a new project or phase.",
  `SQL/v633_process_templates_master_seed_data.sql` / `v634` in the monorepo) plus a
  `"pmbok_group"` JSON key inside that row's `document_data`. Not touched here — `process_template`
  is the ~24-table polymorphic domain already flagged as too risky to touch without live DB
  verification in `v827`/`v197` plans. Flagged as a known follow-up, not silently dropped.
- Sidebar/menu label instances of "PMBOK" — already renamed globally by monorepo
  `SQL/v797_rename_pmbok_track_label_standards_based.sql` (`UPDATE ... SET menu_label =
  REPLACE(menu_label, 'PMBOK', 'Standards-Based') WHERE menu_label LIKE '%PMBOK%'`), prior to
  this session.

## Todo
- [x] Edit `v192_project_template_methodology_completeness_seed.sql` source strings
- [x] `SQL/v199_pmbok_naming_compliance_fix.sql` — rename + republish the 5 live rows
- [ ] Review and run `v199` against Supabase (no DB access this session to execute/verify)
- [ ] Confirm in Platform/Simulator Template Library (methodology=standards_based) that all 5
      names now read "Standards-Based ..." with no "PMBOK" text remaining
- [ ] Decide whether to also tackle the `process_template`/`project_charters` PMBOK mention
      flagged above, as a separate follow-up

## Review

**Status: SQL written, NOT executed — no live database access this session.**

`v_admin_user_id` in `v199` is pre-filled with the id the user already confirmed works for
`v198` earlier this session (`3d8c074f-a82a-4415-b7f7-b7add57d9da8`). The script still verifies
that id exists in `admin.admin_users` before doing anything, and `admin.publish_global_template`
itself re-checks the `content.global_templates.publish` permission independently.

**Left for the user:** review `v199`, run it, then reload the Template Library filtered to
Standards-Based / Project tier and confirm the 5 renamed rows show "Standards-Based ..." instead
of "PMBOK ...".

## Correction — wider PMBOK sweep needed (process_template domain)

User re-checked the Template Library after v199 and found ~50 more affected rows in the
**process_template** domain that v199 didn't touch: e.g. "Monitoring & Controlling Process
Master 02 (Pmbok)", "Initiating Process Master 08 (Pmbok)". These are a completely different
source than the 5 project_template rows above.

**Root cause:** `SQL/v188b_process_template_methodology_seed_min10.sql` generated these rows'
name/description via `format('... (%s)', initcap(v_rec.methodology))` against a hardcoded
`'pmbok'` literal in its own VALUES list. `v196` (methodology-column rename) only updated the
`methodology` *column* on rows that already existed at the time — it never touched this file's
source literal or the frozen name/description text of rows seeded from it. That's why these
rows' "Standards-Based" badge column reads correctly (the column value is current) while the
name text still says "(Pmbok)" (baked in at INSERT time, never revisited).

**Fixed:**
1. **Source** — `v188b_process_template_methodology_seed_min10.sql` edited in place: the
   `'pmbok'` literal is now `'standards_based'`, and a `v_methodology_label` CASE replaces the
   raw `initcap(v_rec.methodology)` calls (which would otherwise render `'standards_based'` as
   the ugly `'Standards_based'`) — decouples display text from the internal enum permanently.
2. **Live data** — new `SQL/v200_pmbok_process_template_naming_compliance_fix.sql`: pattern-based
   (`WHERE name ~* 'pmbok' OR ...`) rather than fixed-ID like v199, since the affected set spans
   up to ~50 rows across 5 categories. Renames matching rows' `name`/`description`/`payload`
   fields, then republishes each so already-copied accounts' `pm_template_nodes` rows update too.

**Still explicitly out of scope:** the `public.project_charters` / `sim.project_charters` seed
description text ("Standard PMBOK project charter...", monorepo `v633`/`v634`) and its
`"pmbok_group"` JSON key — same `process_template` 24-table domain, not touched by v200 either
(v200 only touches `admin.global_template_library`, not the per-domain content tables
`process_template` fans out into). Flagged again as a follow-up, not silently dropped.

**Todo (added):**
- [x] Fix `v188b_process_template_methodology_seed_min10.sql` source
- [x] `SQL/v200_pmbok_process_template_naming_compliance_fix.sql` — pattern-based rename + republish
- [ ] Run `v200` against Supabase (no DB access this session)
- [ ] Confirm in Template Library that no row's name/description contains "Pmbok"/"PMBOK" text
      anywhere (search box, or re-check the Standards-Based + process_template filter combo)
