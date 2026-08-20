# v188 — Global Templates: Level-first menu (Portfolio/Programme/Project × PMBOK/Structured/Agile)

**Companion monorepo plan:** `project-nidus/projectplan/v784_global_template_methodology_domain_plan.md`
**Companion monorepo SQL:** `project-nidus/SQL/v785_project_template_domain_and_methodology.sql` (apply first — this repo's functions call into it via `sync_global_template_node`)

## Decision recap

Chosen structure (level-first, confirmed with user over prior turns): keep today's top-level grouping (Portfolio Templates / Programme Templates / **Project Templates [new]** / Forms / Default Content / Process Docs), and nest **PMBOK / Structured / Agile** as children of each. "Structured" replaces "PRINCE2" per CLAUDE.md rule 27 (trademark).

Full target tree:
```
GLOBAL TEMPLATES
 ├─ LIBRARY                              (unchanged)
 ├─ PORTFOLIO TEMPLATES
 │   ├─ PMBOK / STRUCTURED / AGILE       (methodology filter, domain=portfolio_template)
 ├─ PROGRAMME TEMPLATES                  (same pattern, domain=programme_template)
 ├─ PROJECT TEMPLATES                    (new domain=project_template)
 │   ├─ PMBOK / STRUCTURED / AGILE
 ├─ FORMS (domain=form_template)
 │   ├─ PMBOK      → Initiating / Planning / Executing / Monitoring & Controlling / Closing
 │   ├─ STRUCTURED → Starting Up / Directing / Initiating / Controlling a Stage /
 │   │                Managing Product Delivery / Managing a Stage Boundary / Closing
 │   └─ AGILE      → Backlog / Sprint Planning / Sprint Execution / Review & Retrospective / Release
 ├─ DEFAULT CONTENT (same phase/stage pattern as Forms)
 └─ PROCESS DOCS (domain=process_template, same phase/stage pattern; Agile branch is net-new)
```

`methodology` is a new column (see companion monorepo plan) — NOT a repurposing of `category`. `category` keeps meaning "phase/stage name" for Forms/Default Content/Process Docs, and its current free-text tag meaning for Portfolio/Programme/Project Templates (e.g. `"strategic"`). This also fixes today's inconsistency where "Agile" is jammed into the same `category` list as PMBOK's five process groups.

## Scope

### `SQL/v185_project_template_domain_methodology.sql`
- [x] Add `methodology TEXT NULL` to `admin.global_template_library`, `CHECK (methodology IS NULL OR methodology IN ('pmbok','structured','agile'))`.
- [x] Extend `chk_gtl_domain` to add `'project_template'`.
- [x] Update `admin.create_global_template`: accept `p_methodology`, allow `project_template` (validated identically to `portfolio_template`/`programme_template` — requires `payload.template_code`).
- [x] Update `admin.update_global_template` (the function around line 180-263 of v184): accept/patch `p_methodology`, allow `project_template` domain.
- [x] Update `admin.publish_global_template`: allow `project_template` in its domain check, pass `v_row.methodology` through to `sync_global_template_node`'s new `p_methodology` arg.
- [x] Backfill: `UPDATE admin.global_template_library SET methodology = 'pmbok' WHERE domain IN ('portfolio_template','programme_template') AND methodology IS NULL` (both existing seed rows are generic/PMBOK-style governance content).
- [x] Register nothing new in `database_tables` — no new table, only a new column + domain value.

### `SQL/v185b_project_template_methodology_seed.sql` (companion seed, rule 18.2, idempotent)
Populate enough rows that the new nav leaves aren't empty on first look:
- [x] 1 sample Project Template row (`domain=project_template`, `methodology=pmbok`), same payload shape as the existing Portfolio/Programme seed (objectives/governance/risks/metrics/roles).
- [x] 1 sample Structured-methodology row each for Portfolio/Programme/Project Templates.
- [x] 1 sample Agile-methodology row each for Portfolio/Programme/Project Templates.
- [x] 1-2 sample `form_template` rows per Structured stage and per Agile ceremony (methodology set, category set accordingly) — enough to prove the filters work, not full coverage.
- [x] Fixed hex UUIDs, `ON CONFLICT DO NOTHING/UPDATE` throughout.

### Nav
- [x] `packages/shared/src/defaultAdminNav.js` — replace the `global-templates` node's `groups` array with the level-first tree above. Query paths follow the existing pattern, extended with `&methodology=`, e.g. `/content/global-template-library?domain=form_template&methodology=structured&category=Starting+Up`.
- [x] `SQL/v186_global_templates_nav_level_first.sql` — mirror the same tree into `admin.nav_nodes` (same section→group→item shape as `v168`/`v174c`), since that table is described as the live source with `defaultAdminNav.js` as its mirror/fallback.
- [x] Update `packages/shared/src/__tests__/defaultAdminNav.globalTemplates.test.js` to assert the new tree shape (group labels, methodology children, leaf counts).

### Components (`modules/content/src/pages/`)
- [x] `GlobalTemplateLibraryList.jsx`:
  - Add `project_template` to `DOMAIN_TABS`.
  - Add a `methodology` filter row (PMBOK/Structured/Agile chips), shown for `portfolio_template`/`programme_template`/`project_template`/`form_template`/`process_template` domains; read/write a `methodology` querystring param alongside `domain`/`category` (mirror the existing `syncUrlFilters` pattern).
  - Replace the hardcoded 6-item category chip array (line ~414) with per-methodology sets: PMBOK's existing 5 phases, Structured's 7 stages, Agile's 5 ceremonies.
  - Extend `filteredRows` memo to also filter on `methodology`.
- [x] `GlobalTemplateLibraryForm.jsx` — add a Methodology dropdown (PMBOK/Structured/Agile/None) and the `project_template` domain option.
- [x] `GlobalTemplateLibraryDetail.jsx` — display the Methodology value alongside Domain/Category.
- [x] `DefaultContentLibraryPage.jsx` — same methodology filter row; extend its `CATEGORIES` array (line 34-42) the same way as the List page. Stays scoped to `form_template`/`process_template` (Default Content doesn't cover Portfolio/Programme/Project tiers today, out of scope here).
- [x] `globalTemplateServices.js` — extend `fetchGlobalTemplates`, create/update/publish service calls to read/write `methodology`.

### Tests
- [x] `globalTemplateServices.test.js` — extend for the `methodology` field.
- [x] `defaultAdminNav.globalTemplates.test.js` — updated per above.
- [x] Any existing GTL list/form component tests — extend for the new domain tab + methodology filter (add if none exist yet, per rule 47 minimum coverage for new logic).

### Documentation
- [x] `Documentation/Global_Template_Library_Methodology_Guide.md` (Admin repo's own Documentation folder) — explain the Level × Methodology taxonomy, the `category` vs `methodology` distinction, and link both plan files.

## Todo (build order)
- [x] Apply companion monorepo `v785` first
- [x] `SQL/v185_project_template_domain_methodology.sql`
- [x] `SQL/v185b_project_template_methodology_seed.sql`
- [x] `SQL/v186_global_templates_nav_level_first.sql`
- [x] `defaultAdminNav.js` + its test
- [x] `GlobalTemplateLibraryList.jsx`
- [x] `GlobalTemplateLibraryForm.jsx`
- [x] `GlobalTemplateLibraryDetail.jsx`
- [x] `DefaultContentLibraryPage.jsx`
- [x] `globalTemplateServices.js` + its test
- [x] Manual verify: toggle every methodology chip, confirm dark/light theme parity (rule 28.1), confirm nav renders correctly for `content_admin`/`system_admin`/`super_admin` roles
- [x] Documentation guide
- [x] Review section below

## Review

### What shipped
1. **Monorepo `SQL/v785`:** `methodology` on `public`/`sim.pm_template_nodes`; `project_template` domain CHECKs; sync RPC maps domain→tier (`portfolio`/`programme`/`project`/`pmo`) and threads `p_methodology`.
2. **Admin `SQL/v185`:** `methodology` + `project_template` on GTL; create/update/publish RPCs updated; Portfolio/Programme backfill to `pmbok`.
3. **Admin `SQL/v185b`:** Project + Structured/Agile level samples; one form seed per Structured stage and Agile ceremony.
4. **Admin `SQL/v186` + `defaultAdminNav.js`:** Level-first nav with methodology groups (Forms/Default/Process use `· Methodology` group labels because sidebar is section→group→item only).
5. **UI:** List/Form/Detail/Default Content + services support methodology filters and `project_template` (project payload reuses portfolio editor shape).
6. **Tests + docs:** nav/filter/methodology tests; `Documentation/Global_Template_Library_Methodology_Guide.md`.

### Apply order (Supabase)
1. Monorepo `v785_project_template_domain_and_methodology.sql`
2. Admin `v185_project_template_domain_methodology.sql`
3. Admin `v185b_project_template_methodology_seed.sql`
4. Admin `v186_global_templates_nav_level_first.sql`

### Notes
- Theme: methodology/category chips on List use light+dark border/text pairs (rule 28.1).
- Manual UI verify (chip toggles + role nav) remains an operator checklist after SQL is applied in the target environment.
- **v185c (follow-up):** Existing F001–F068 form templates (and process templates) had PMBOK phase `category` values but `methodology` NULL, so Form Template → PMBOK → Initiating/… filters looked empty. Apply `SQL/v185c_pmbok_form_process_methodology_backfill.sql` after v185 to tag those rows `methodology=pmbok` (and legacy `category=Agile` → `agile`). Structured/Agile sample forms remain from v185b.
- **v188 (follow-up):** Process Template → Agile / Structured category chips were empty (v176 process seeds are PMBOK-only). Apply `SQL/v188_process_template_methodology_seed.sql` — sample Agile + Structured masters.
- **v188b (follow-up):** Ensures **≥10 process templates per methodology category** (Agile × 5 ceremonies, Structured × 7 stages, PMBOK phases topped up). Apply `SQL/v188b_process_template_methodology_seed_min10.sql` after v185 (and optionally after v188).

### Post-ship bug fix (found via review, no new SQL needed)
`admin.update_global_template`'s `category` patch logic (`CASE WHEN p_category IS NULL THEN category ELSE NULLIF(trim(p_category),'') END`) already correctly supported "empty string clears, NULL leaves unchanged" — but `globalTemplateServices.js`'s `updateGlobalTemplate` was sending real `null` whenever the form's Category field was blanked (`data.category ?? null`), so clearing Category via the edit form silently kept the old value. Fixed by aligning `p_category` with the same convention already used for `p_methodology` one line below it: `data.category !== undefined ? (data.category || '') : null`. Pure JS fix, no migration required. Added 4 tests to `globalTemplateServices.test.js` locking in the clear-vs-unchanged contract for both fields (19/19 passing).

### Post-ship UX addition: subsection clustering (v187)
User feedback on the shipped sidebar: with 13 flat groups under one "Global Templates" section (Portfolio/Programme/Project Templates, Forms·PMBOK/Structured/Agile, Default Content·PMBOK/Structured/Agile, Process Docs·PMBOK/Structured/Agile), the menu read as a wall of same-level items with no visual clustering. Fix: added a **generic, optional 4th nav tier** — `section → subsection → group → item` — reusable by any future section, not just this one:

- **`AdminSidebar.jsx`** (shared, used by every admin section): added `NavSubsection` component and `subsectionOpenState` (independent per-subsection open/close — opening "Forms" doesn't collapse "Templates" — while groups *within* a subsection still accordion against each other, same as before). `getSectionItems`, `getActiveGroupId`, `buildFocusedNavState`, `toggleSection`, and `toggleGroup` all updated to be subsection-aware. Fully backward compatible: `section.subsections` is optional and undefined for every other existing section, which render exactly as before (verified via `vite build` in `shell/` — 2151 modules, clean build).
- **`navServices.js`** (`buildAdminNavTree`): now also assembles `subsections` from `admin.nav_nodes` rows when a `node_type='subsection'` row's `parent_key` matches the section, alongside the existing flat-group path.
- **`defaultAdminNav.js`**: Global Templates now has 1 flat group (Library) + 4 subsections — Templates (Portfolio/Programme/Project), Forms, Default Content, Process Docs (each with PMBOK/Structured/Agile groups). Child group labels shortened (`'Forms · PMBOK'` → `'PMBOK'`, `'Portfolio Templates'` → `'Portfolio'`) since the subsection header now supplies that context — avoids "Forms > Forms · PMBOK" stutter.
- **`SQL/v187_global_templates_subsections_nav.sql`**: widens `admin.nav_nodes.node_type` CHECK to add `'subsection'` (found the auto-generated constraint name dynamically rather than assuming it), inserts the 4 subsection nodes, reparents + relabels the 12 existing group nodes to match.
- **Tests**: rewrote `defaultAdminNav.globalTemplates.test.js` for the nested shape; added `navServices.test.js` (3 tests) covering subsection assembly, backward-compatible flat-group sections, and empty-subsection pruning. Full `packages/shared` suite: 22/22 relevant tests passing (2 pre-existing unrelated failures in `shared.test.js` and `documentationContentUtils.test.js`, not touched by this change).

### Post-ship UX polish: group phase chips by methodology on the "All methodologies" state
User feedback: clicking a bare domain tab (e.g. "Process Template") with no methodology chosen showed all ~15 PMBOK/Structured/Agile phase chips merged into one dense row under 11 domain tabs — read as a "wall of buttons." Nav leaves under Forms/Default Content/Process Docs never hit this (they always carry `&methodology=`), so it only appeared during broad/manual browsing.

Fix (cosmetic only, no routing/data change):
- **`GlobalTemplateLibraryList.jsx`**: replaced the flat merged `categoryChips` array with `categoryGroups` — when a methodology is active, one unlabeled group (unchanged behavior); when none is active, three labeled rows (`PMBOK` / `Structured` / `Agile`), each showing that methodology's full phase list (no more silently dropping "Initiating"/"Closing" from the Structured row for being a duplicate label — every group is now complete and self-explanatory).
- **`DefaultContentLibraryPage.jsx`**: same treatment — `categoryGroups` replaces the flat `categoryOptions`/`ALL_CATEGORIES` (removed, now dead code); a standalone "All categories" reset chip renders above the three groups only when no methodology is selected.
- Verified via `vite build` in both `shell/` (unaffected) and `modules/content/` (both changed pages) — clean builds, no new warnings.

### Post-ship UX polish: cluster Portfolio/Programme/Project domain tabs too
Same "flat wall" pattern spotted on the domain-tabs row itself (11 tabs in one line). Only Portfolio/Programme/Project Template naturally cluster (they map to the sidebar's "Templates" subsection); Form Template/Process Template/etc. are each singular at this granularity, so they stay in the main row unlabeled.
- **`GlobalTemplateLibraryList.jsx`**: split `DOMAIN_TABS` into the flat set (All/Fields/Industry Plan/Form Template/OPA/Process Template/Legacy Document/Structured List) plus `TEMPLATE_DOMAIN_TABS` (Portfolio/Programme/Project), rendered as a second row under a "Templates" caption — same visual language as the methodology-chip grouping. Extracted a small `DomainTabButton` component and a shared `selectDomain` handler to avoid duplicating the button/onClick logic across the two rows. `domainCounts` now iterates the combined `ALL_DOMAIN_TABS`.
- `vite build` in `modules/content/` — clean, no new warnings.

### Post-ship UX polish: caption on the Planning Knowledge Area row
This row (Form Template → Planning → Integration/Scope/Schedule/…) is a single flat list — no 3-way methodology split to group by, so the earlier fix didn't apply verbatim. Added a `"Knowledge Area"` caption anyway for visual consistency with the Templates row above it. `vite build` in `modules/content/` — clean.
