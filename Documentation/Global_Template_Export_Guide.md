# Global Template Export Guide

**Feature:** Form Template export (Plain / Completed Sample / Completed Real)  
**App:** Project Nidus Admin — Content → Global Template Library  
**Plans:** `projectplans/v174_form_template_export_plain_completed_plan.md`, `projectplans/v178_form_template_export_offline_guidance_plan.md`, monorepo `projectplan/v776_admin_form_instance_read_access_plan.md`

## Where to export

1. Open a **form_template** domain record in **Global Template Library** (detail / view page).
2. In the **Form layout** card header, use the **Export** dropdown.

Export is available on the detail view only (not the edit form), consistent with export-on-view conventions.

## Data modes

| Mode | What it exports | Data source |
|------|-----------------|-------------|
| **Plain Template** | Blank fillable form with **guidance** under each field and optional **Example:** lines | Schema `help` + `sample` |
| **Completed (Sample data)** | Guidance under labels + sample answers filled in (no duplicate Example line) | Per-field Sample / example |
| **Completed (Real submission)** | Guidance under labels + real project answers | Platform or Simulator `form_instances` (`in_review` / `approved`) |

## Offline guidelines (v178 / v179)

Each field can carry:

| Field | Editor label | Role in export |
|-------|--------------|----------------|
| `help` | **Guidance (offline / on-screen help)** | Description under the field label (all modes) |
| `sample` | **Sample / example value** | Fills Completed (Sample); on **Plain** also shown as `Example: …` |

Example Plain layout:

```
1.4 Sponsor
    Name the executive sponsor and their role.
    Example: Amina Okonkwo — COO
    _______________
```

Edit guidance in the Global Template form editor (card or table view). After **Publish**, synced schema help becomes the baseline for Platform/Simulator organisations; PMO/PM can override via Default Content → Guidance (see monorepo v770 / v780 / v781).

**Content seeds**

| File | Role |
|------|------|
| `SQL/v178_…` | Legacy: F001 curated + **generic** filler for others — **superseded** |
| `SQL/v179_global_form_template_curated_guidance_seed.sql` | **Current:** curated `help` + `sample` for **all** F001–F068 fields |
| `SQL/v179b_curated_guidance_boilerplate_smoke.sql` | Expect **0** leftover “Briefly complete…” help strings |

Regenerate from monorepo: `node scripts/v781_build_curated_guidance_seeds.mjs` (writes Admin + Platform/Sim SQL).

## Reinstate standard fields (v180)

On the form template **edit** Form layout:

1. **Remove** a field (when more than one remains) — it is kept in a session list for that section.
2. Click **Restore field…** next to **+ Add field**.
3. Pick a field from:
   - **Removed this session** (full prior definition including guidance/sample), or
   - **Standard catalog** (F001–F068 system field missing from the section).
4. The field is **appended at the end of the section** — drag the row handle to reorder if needed.

Custom fields that were never in the system catalog can only be restored within the same edit session (or re-added manually).

Regenerate the catalog JSON after monorepo seed schema changes:

`node scripts/generate_form_template_standard_catalog.mjs`

## Formats

All modes support: **PDF, Word, Excel, PowerPoint, CSV, XML, JSON, Print**.

PDF / Word / PowerPoint / Print render guidance as italic text under the label. Excel / CSV / XML / JSON prepend guidance (and Example on Plain) into the value cell so offline files stay self-explanatory.

## Entering Sample values

1. Edit the global form template.
2. In each field (card or table view), set **Sample / example value**.
3. Save the template. Values live in `payload.schema.sections[].fields[].sample` (JSONB) — no separate table.

Table view: Guidance and Sample columns are drag-reorderable. Export document order always follows **field row order**, not column order.

## Real submission export

1. Choose **Completed (Real submission)**.
2. Pick **Platform** or **Simulator**.
3. Select a submitted form instance (project name, status, owner, last updated).
4. Choose a format.

Requires permission `content.global_templates.export_completed` (granted to `super_admin`, `system_admin`, `content_admin`).

Linkage uses `payload.template_code` matching Platform/Simulator `form_templates.template_code`.

## SQL prerequisites

| Order | File | Purpose |
|-------|------|---------|
| 1 | Monorepo `SQL/v779_admin_form_instance_read_access.sql` | `public`/`sim` read RPCs |
| 2 | Admin `SQL/v177_admin_form_instance_read_wrapper.sql` | Admin permission + wrappers |
| 3 | Admin `SQL/v179_global_form_template_curated_guidance_seed.sql` | Curated help/sample for all form templates |
| 4 | Monorepo `SQL/v781_form_template_curated_offline_guidance_seed.sql` | Platform/Sim schema + org defaults |

After v179, **Publish** form templates if orgs rely on Admin sync; still run v781 so org Default Content boilerplate is replaced.
