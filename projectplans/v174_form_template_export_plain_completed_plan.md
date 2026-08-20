# v174 — Form Template Export: Plain Template & Completed Template Data (PDF/Word + 5 more formats)

**Repo:** `E:\project-nidus-admin` (Admin app, `content` module)
**Companion plan (cross-repo, required for Phase 2):** `E:\project-nidus\projectplan\v776_admin_form_instance_read_access_plan.md`
**Related parity plan:** `E:\project-nidus\projectplan\v777_form_template_export_and_builder_dnd_parity_plan.md` — Platform/Simulator have their own local form-template builder (`FormTemplateBuilder.jsx`) which is the true parity target for this plan's drag-and-drop work (already shipped there per rule 34.1) and its export work (drafted, not yet built there).
**Status:** ✅ Complete (Phase 1 + Phase 2)

## Background

The Global Template Library's `form_template` domain editor ([FormTemplatePayloadEditor.jsx](../modules/content/src/pages/FormTemplatePayloadEditor.jsx)) already lets an admin define a form's sections/fields (Label, Field key, Type, Required, Help text, Options), with a table view (added this session) supporting drag-and-drop column and row reordering.

The user wants to **export a `form_template` record as a document** (PDF or Word, and — per decision below — all 7 export formats already standardised elsewhere in the app) in two modes:

1. **Plain Template** — the blank form structure, ready to print/fill by hand or attach to a governance pack.
2. **Completed Template Data** — the same document with field values filled in. Two data sources, both approved:
   - **(a) Sample data** — example values the admin types into the template itself (new, Admin-only, no cross-repo dependency).
   - **(b) Real submission** — actual data from a completed form on a real Platform or Simulator project. This requires a new **read-only** cross-schema RPC path (Admin currently has zero read access into `public`/`sim` — only the existing narrow *write* path via `sync_global_template_node`). See the companion plan.

## Existing infrastructure discovered (reuse, don't rebuild)

`packages/shared/src/exportUtils.js` already implements, for a **single record**: `exportRecordToWord`, `exportRecordToExcel`, `exportRecordToPPT`, `exportRecordToCSV`, `exportRecordToXML`, `exportRecordToJSON`, `exportRecordToPrint`. All take `(sections, record, baseFilename, branding)` where `sections = [{ title, fields: [{ key, label }] }]` and `record` is a flat `{ [key]: value }` object. Multi-value fields (arrays) already render as bullets (Word/Excel/PPT/Print) per rule 38.4/38.5.

**Missing (now shipped):** `exportRecordToPDF` and reusable `ExportRecordMenu` for record export.

`GlobalTemplateLibraryDetail.jsx` / `GlobalTemplatePayloadView.jsx` Form layout card — export controls live here for `form_template` only.

## Phase 1 — Admin-only: Plain Template + Completed (Sample), all 7 formats

No cross-repo dependency. Ships independently.

### 1.1 Schema: add per-field "Sample value"
- [x] `FormTemplatePayloadEditor.jsx`: add `sample` to the field shape (alongside `key`, `label`, `type`, `required`, `options`, `help`) in `emptyField()`, `schemaToEditor()`, `editorToSchema()`.
- [x] Add `sample` to `DEFAULT_COLUMN_ORDER` (table view) and `COLUMN_LABELS`/`COLUMN_WIDTHS`, so it's drag-reorderable like the other attributes. Add a "Sample value" input in `renderFieldCell()`.
- [x] Add the same "Sample value" input to the card view (under Help text), with helper copy: *"Optional example answer — used for 'Completed (Sample)' exports."*
- [x] No new DB table → no `database_tables` registry entry needed (it's a JSONB field on the existing `payload.schema`).

### 1.2 `exportRecordToPDF` (new)
- [x] Add to `packages/shared/src/exportUtils.js`, mirroring `exportRecordToWord`'s section/field walk but rendering via the already-imported `jsPDF` + `jspdf-autotable` (same libs `exportListToPDF` uses). Layout: title, export-date subtitle, one `autoTable` per section (2 columns: Label / Value), footer brand text — consistent with the PDF list export's visual style.
- [x] Multi-value fields render as newline-joined bullets inside the value cell (same `formatCellValue` helper already used everywhere else).

### 1.3 Blank/fillable rendering for Plain Template
- [x] Add an optional `blankPlaceholder` param (default `'—'`, current behaviour unchanged) to all 8 `exportRecordTo*` functions. When a caller passes e.g. `blankPlaceholder: '_______________'`, empty values render as a ruled blank line instead of an em-dash — so a Plain Template reads as a fillable form, not "missing data."
- [x] `formatCellValue`/each function's `|| '—'` literal becomes `|| blankPlaceholder` (via `displayValue` helper).

### 1.4 Data-shaping helpers (Admin, `content` module or `@nidus-admin/shared`)
- [x] `schemaToExportSections(schema)` — maps `schema.sections[].fields[]` (key/label) into the `{title, fields:[{key,label}]}` shape the export functions expect, respecting each field's current `fieldColumnOrder`-independent canonical order (export always follows **row order**, i.e. `section.fields` array order — column order only affects the on-screen table, not the exported document).
- [x] `buildSampleRecord(schema)` — flattens `{ [field.key]: field.sample || '' }` across all sections.
- [x] `buildBlankRecord(schema)` — flattens `{ [field.key]: '' }` across all sections (used for Plain Template; combined with `blankPlaceholder`).

### 1.5 `ExportRecordMenu` component (new, `packages/ui`)
- [x] Two-level dropdown, visually consistent with `ExportListMenu.jsx` (reuse its icon set): first choose **data mode** — "Plain Template" / "Completed (Sample data)" / "Completed (Real submission)" — then choose **format**: PDF, Word, Excel, PowerPoint, CSV, XML, JSON, Print.
- [x] Accepts `{ schema, templateName, branding }` and internally calls the right helper + `exportRecordTo*` function. Component owns the two-step UI state; callers don't need to know the export plumbing.

### 1.6 Wire into `GlobalTemplateLibraryDetail.jsx`
- [x] Render `<ExportRecordMenu>` in the Form Layout card's header, **only when `row.domain === 'form_template'`** (via `GlobalTemplatePayloadView`).
- [x] `baseFilename` = `${template_code}_${slugified name}`.

### 1.7 Tests (rule 23)
- [x] Unit tests for `schemaToExportSections`, `buildSampleRecord`, `buildBlankRecord` (pure functions, easy to test).
- [x] Smoke test `exportRecordToPDF` runs without throwing against a representative schema (jsdom + mocked `URL.createObjectURL`/`doc.save`).

### 1.8 Documentation
- [x] New `Documentation/Global_Template_Export_Guide.md` — explains Plain vs Completed(Sample) vs Completed(Real), the 7 formats, and where Sample values are entered.

## Phase 2 — Real submission data (cross-repo, needs companion plan approved first)

Depends entirely on `v776_admin_form_instance_read_access_plan.md` (monorepo) landing first — it defines the new read-only RPCs. Summary of the Admin-side work once that exists:

### 2.1 Admin-side read wrapper RPCs
- [x] New SQL file `E:\project-nidus-admin\SQL\v177_admin_form_instance_read_wrapper.sql`:
  - `admin.list_completed_form_instances(p_global_template_id UUID, p_target TEXT)` — `SECURITY DEFINER`, checks `admin.check_admin_permission(caller, 'content.global_templates.export_completed')`, calls `public.list_form_instances_for_template(...)` or `sim.list_form_instances_for_template(...)` per `p_target` (same dispatch pattern `admin.publish_global_template` already uses for `sync_global_template_node`).
  - `admin.get_completed_form_instance(p_form_instance_id UUID, p_target TEXT)` — same pattern, wraps `get_form_instance_export_data`.
  - New permission row: `('content.global_templates.export_completed', 'Export Completed Form Data', 'content', 'Export real submitted form data from Platform/Simulator projects')` in `admin.permissions`, granted to `super_admin`/`system_admin`/`content_admin` (mirror existing `publish` grants in `v160_global_template_library_tables.sql:87-103`).

### 2.2 Admin UI: instance picker
- [x] New picker step in `ExportRecordMenu` (or a small modal launched from it) when "Completed (Real submission)" is chosen: Target (Platform/Simulator) → list of completed instances for this template (project name, status, last updated) → select one.
- [x] New service functions in `@nidus-admin/shared`: `fetchCompletedFormInstances(templateId, target)`, `fetchCompletedFormInstanceData(instanceId, target)`.
- [x] Selected instance's values feed the same `exportRecordTo*` functions from Phase 1 — no duplicate export logic.

### 2.3 Tests
- [x] Integration test for the picker → export flow (mocked RPC responses).

## Open decisions for review

1. **Permission key** — proposing `content.global_templates.export_completed` as a new, separate permission (real-submission export is more sensitive than editing the template itself, since it surfaces real project data inside the Admin console). Confirm this is the right granularity. → **Implemented as proposed.**
2. **Real-submission linkage** — `form_templates.pm_template_node_id` links a Platform/Simulator `form_templates` row back to the synced `pm_template_nodes` row, but Admin's `global_template_library.id` isn't directly the same as `form_templates.id`. The read RPC will need to resolve `form_templates` by matching on `template_code` (unique in both `form_templates` and `global_template_library`) rather than by id — flagged for implementation-time verification against the companion plan. → **Implemented via `payload->>'template_code'`.**
3. **Format scope confirmation** — you asked for PDF/Word specifically, then confirmed "all 7 now" when asked. This plan builds all 7 for Plain + Sample in Phase 1. Real-submission (Phase 2) reuses the same 7 automatically once wired. → **Shipped (8 formats including PDF).**

## Review

### What shipped

**Phase 1 (Admin-only)**
- Per-field `sample` on form template schema (editor card + table column).
- `exportRecordToPDF` + `blankPlaceholder` / `displayValue` on all record exporters in `@nidus-admin/shared` `exportUtils.js`.
- Helpers: `formTemplateExportUtils.js` (`schemaToExportSections`, `buildSampleRecord`, `buildBlankRecord`, filename helpers).
- `ExportRecordMenu` in `@nidus-admin/ui`, wired on Global Template detail Form layout header for `form_template` only.
- Docs: `Documentation/Global_Template_Export_Guide.md`.
- Tests: `formTemplateExportUtils.test.js` (7 cases including PDF smoke).

**Phase 2 (cross-repo)**
- Monorepo `SQL/v779_admin_form_instance_read_access.sql` — `public`/`sim` `list_form_instances_for_template` + `get_form_instance_export_data` (service_role only).
- Admin `SQL/v177_admin_form_instance_read_wrapper.sql` — permission + `admin.list_completed_form_instances` / `admin.get_completed_form_instance`.
- Services + picker UI inside `ExportRecordMenu`.
- Tests: `formInstanceExportServices.test.js` (mocked RPC).
- `CLAUDE.md` (monorepo) updated with narrow **read** exception (v779 / Admin v177).

### Deviations from plan

1. Form engine has no `status = 'completed'`. Submitted forms listed as `status IN ('in_review', 'approved')` (documented in SQL + guide).
2. Export menu mounted via `GlobalTemplatePayloadView` Form layout card (still only on detail for `form_template`) rather than directly in `GlobalTemplateLibraryDetail.jsx` body — same UX location the plan specified.
3. CSV/XML/JSON gained an unused `branding` positional arg so `blankPlaceholder` stays consistently 5th after branding across all 8 exporters.

### Apply order (DB)

1. `E:\project-nidus\SQL\v779_admin_form_instance_read_access.sql`
2. `E:\project-nidus-admin\SQL\v177_admin_form_instance_read_wrapper.sql`

### Follow-ups

- ~~Platform/Simulator export parity remains under `v777` Part B~~ → **Done** (`v777` + `v780`).
- Manual SQL-editor smoke against seeded form instances after applying v779/v177.
