# Global Template Library — Level × Methodology

**Plans:** Admin `projectplans/v188_global_templates_level_first_menu_plan.md` · Monorepo `project-nidus/projectplan/v784_global_template_methodology_domain_plan.md`  
**SQL:** Admin `SQL/v185_*`, `v185b_*`, `v186_*` · Monorepo `SQL/v785_project_template_domain_and_methodology.sql`

## Taxonomy

Global Templates are organised **level-first**, then by **methodology**:

| Level group | Domain | Methodology children |
|---|---|---|
| Portfolio Templates | `portfolio_template` | Standards-Based · Structured · Agile |
| Programme Templates | `programme_template` | same |
| Project Templates | `project_template` | same (new in v185/v785) |
| Forms / Default Content / Process Docs | `form_template` / `process_template` | methodology groups, each with phase/stage leaves |

**Structured** is the non-trademark name used in place of “PRINCE2”, and **Standards-Based** is the non-trademark name used in place of “PMBOK” (Admin CLAUDE rule 27). The underlying `methodology` column value is `standards_based` (renamed from `pmbok` in Admin v196 / monorepo v798).

### Forms / Default Content / Process Docs phases

| Methodology | Category values (`category` column) |
|---|---|
| **Standards-Based** | Initiating · Planning · Executing · Monitoring & Controlling · Closing |
| **Structured** | Starting Up · Directing · Initiating · Controlling a Stage · Managing Product Delivery · Managing a Stage Boundary · Closing |
| **Agile** | Backlog · Sprint Planning · Sprint Execution · Review & Retrospective · Release |

Sidebar query examples:

- `/content/global-template-library?domain=project_template&methodology=standards_based`
- `/content/global-template-library?domain=form_template&methodology=structured&category=Starting+Up`
- `/content/default-content-library?methodology=agile&category=Backlog`

## `methodology` vs `category`

| Column | Meaning |
|---|---|
| **`methodology`** | Orthogonal track: `standards_based` \| `structured` \| `agile` (nullable). |
| **`category`** | For Forms / Process / Default Content: **phase or stage name**. For Portfolio / Programme / Project: free-text tag (e.g. `strategic`, `delivery`). |

Do **not** put “Agile” in `category` as a pseudo-phase. That was the old inconsistency; Agile is now a methodology with its own ceremony categories.

## Downstream sync (Platform / Simulator)

Publishing a Global Template calls `public.sync_global_template_node` / `sim.sync_global_template_node` with `p_methodology`. Nodes land on `pm_template_nodes` with:

- matching `methodology`
- **tier** derived from domain: `portfolio_template` → `portfolio`, `programme_template` → `programme`, `project_template` → `project`, other domains → `pmo`

Apply monorepo **v785** before Admin **v185**.

## Authoring UI

- List: domain tabs include **Project Template**; methodology chips appear for level + form/process domains; category chips follow the selected methodology.
- Form: Methodology dropdown (Standards-Based / Structured / Agile / None) plus `project_template` domain (payload shape reused from portfolio masters).
- Detail: shows `domain · methodology · category`.

## Seed samples

Admin `SQL/v185b_project_template_methodology_seed.sql` seeds:

- 1 Standards-Based project template
- Structured + Agile samples for Portfolio / Programme / Project
- One form_template per Structured stage and Agile ceremony

Admin `SQL/v192_project_template_methodology_completeness_seed.sql` **completes Project Templates** so each methodology filter is a full set (not a single sample):

| Methodology | Categories (one project master each) |
|---|---|
| **Standards-Based** | Initiating · Planning · Executing · Monitoring & Controlling · Closing |
| **Structured** | Starting Up · Directing · Initiating · Controlling a Stage · Managing Product Delivery · Managing a Stage Boundary · Closing |
| **Agile** | Backlog · Sprint Planning · Sprint Execution · Review & Retrospective · Release |

Payloads include objectives, governance, risks, metrics, and roles (not empty stubs). The list UI shows the same category chips for `project_template` as for Forms/Process Docs.

Admin `SQL/v185c_pmbok_form_process_methodology_backfill.sql` originally tagged those rows `methodology=pmbok`; after **Admin v196** / **monorepo v798**, live data uses `methodology=standards_based`. Legacy `category=Agile` rows remain `methodology=agile`.

Admin `SQL/v188_process_template_methodology_seed.sql` adds sample Agile / Structured process masters.

Admin `SQL/v188b_process_template_methodology_seed_min10.sql` **tops up to at least 10 process templates per methodology category** (Agile ceremonies, Structured stages, and thin Standards-Based phases). Re-run safe — only inserts the shortfall.

### Structured field completeness (v189)

Admin `SQL/v189`–`v189e` replace the thin 2-field Structured `form_template` placeholders and add the full Structured document set (section-derived fields). Generator: `scripts/generate-v189-structured-seeds.js`.

| File | Content |
|---|---|
| `v189_structured_forms_starting_up_directing.sql` | Mandate, Brief, Daily/Lessons Log, Board Agenda, Highlight Report |
| `v189b_structured_forms_initiating.sql` | PID (full), Business Case, Benefits Review Plan, Project Product Description, Plan |
| `v189c_structured_process_docs_strategies.sql` | Quality / Risk / Configuration / Communication Management Strategy (`process_template`) |
| `v189d_structured_forms_controlling_stage.sql` | CIR, Issue Register/Report, Product Status Account, Quality/Risk Register, Exception Report |
| `v189e_structured_forms_delivery_and_closure.sql` | Checkpoint Report, Product Description, Work Package, End Stage/Lessons Report, End Project Report |

Apply after `v185`/`v188`/`v188b`. Idempotent (`ON CONFLICT DO UPDATE`). Labels use **Structured** only (rule 27).

### Agile field completeness (v191)

Admin `SQL/v191`–`v191e` replace the thin 2-field Agile `form_template` placeholders and add ceremony sibling forms plus process approach docs. Generator: `scripts/generate-v191-agile-seeds.js`.

| File | Content |
|---|---|
| `v191_agile_forms_backlog.sql` | PBI (full), Epic, Spike, Refinement Notes |
| `v191b_agile_forms_sprint_planning.sql` | Planning Agenda (full), Sprint Goal, Capacity Plan |
| `v191c_agile_forms_sprint_execution.sql` | Stand-up (full), Impediment, Task Card, Forecast |
| `v191d_agile_forms_review_retro_release.sql` | Review, Retro, Demo Feedback, Release Checklist/Notes/Go-No-Go/Deploy |
| `v191e_agile_process_docs_approaches.sql` | DoD (Release), DoR (Backlog), Backlog/Cadence/Release approaches + enrich 3× v188 process rows |

Apply after `v185b`/`v188`/`v188b` (and ideally after Structured `v189*`). Idempotent. **DoD → Release**, **DoR → Backlog**.

### Platform / Simulator parity (monorepo v786 + v787)

Monorepo `SQL/v786_structured_agile_form_template_seeds.sql` upserts `FS-*` / `FA-*` form schemas into **`public` and `sim` `form_templates`**.  
Monorepo `SQL/v787_structured_agile_process_template_seeds.sql` upserts Structured strategies + Agile approaches (Admin `v189c` / `v191e`) into process document tables (`project_management_plans`, etc.) as `is_master` rows (`SEED787-*`).  

See `project-nidus/Documentation/Platform_Simulator_Methodology_Form_Parity_Guide.md`.

Enough for empty nav leaves to show content on first look; Structured and Agile forms now have real field catalogs (not 2-field stubs).
