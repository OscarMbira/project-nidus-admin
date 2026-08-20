# v178 / v780 — Form Template Export: Offline Field Guidelines (+ editable Help)

**Admin plan:** `E:\project-nidus-admin\projectplans\v178_form_template_export_offline_guidance_plan.md`  
**Monorepo companion:** `E:\project-nidus\projectplan\v780_form_template_export_offline_guidance_plan.md` (Platform/Simulator parity — still pending)  
**Builds on:** Admin `v174` (export Plain/Sample/Real), monorepo `v770` (org Guidance + Sample defaults), `v777` Part B (Platform/Sim export — still draft)  
**Status:** ✅ Admin (Part A) complete — Monorepo Part B pending

## Problem (from your Project Charter PDF)

Plain Template export currently prints **field labels + blank lines only**. Users filling the form offline get no instructions. You want:

1. **Brief descriptions** under each field so the printed/PDF/Word form is self-explanatory.
2. **Examples where useful** (e.g. how to write Objectives or Budget).
3. Guidelines **editable** by:
   - **System (Admin)** — Global Template Library form_template editor (`help` / Sample).
   - **PMO/PM (Platform & Simulator)** — already exists as **Default Content → Guidance** (`guidance_text`); must feed the same export behaviour.

## What already exists (reuse — do not reinvent)

| Layer | Editable guidance today | Used in on-screen forms? | Used in Plain export today? |
|-------|-------------------------|--------------------------|-------------------------------|
| **Admin** Global Template | Field **Help text** (`payload.schema…fields[].help`) + **Sample value** | Yes (after publish/sync into org templates) | **Yes (v178)** |
| **Platform / Simulator** | Default Content tab: **Guidance** (`form_template_field_defaults.guidance_text`) + Sample default | Yes (`v770`) | Pending Part B / v780 |

F001 Project Charter already has rich curated guidance + samples in monorepo `SQL/v770b_…` — surfaced in Admin exports and mirrored into Admin global schema via `SQL/v178_…`.

## Proposed behaviour

### Export document layout (Plain Template — primary)

For each field:

```
1.4 Sponsor
    Name the executive sponsor and their role. Example: “Amina Okonkwo — COO”.
    _______________
```

Rules:

- **Description** = field `help` (Admin schema) or, on Platform/Sim, org `guidance_text` if set, else schema `help`.
- **Example** (optional line): if Sample / sample default exists and mode is Plain, append `Example: …` (truncated if long). For **Completed (Sample)** mode, values already fill the answer line — still show description above the value; do **not** duplicate the example line.
- **Completed (Real)** — show description under the label (read-only context), then the submitted value.
- All formats that use section/field walk (PDF, Word, PPT, Print especially; Excel/CSV/XML/JSON: put description in a companion column or nested note where practical — prefer PDF/Word/Print first-class).

### Editability (no new permission model)

1. **Admin:** keep editing **Help text** (+ Sample) in `FormTemplatePayloadEditor` — rename labels/helper copy to make clear these drive **offline export guidelines**.
2. **Platform / Simulator:** keep editing **Guidance** on Default Content (PMO/PM). Export reads that first.
3. After Admin **Publish**, synced schema `help` becomes the baseline for orgs; org Guidance can override per field without changing the global catalog.

## Implementation todos

### A — Admin (`E:\project-nidus-admin`) — plan file `projectplans/v178_…`

- [x] **A.1** Extend export shaping: `schemaToExportSections` (or sibling) includes `help` / `guidance` (+ optional `example` from `sample`) on each field.
- [x] **A.2** Extend `exportRecordToPDF` / Word / PPT / Print (and light touch for Excel etc.) to render description (+ Example line in Plain mode) under the field label before the value/blank.
- [x] **A.3** `ExportRecordMenu`: pass mode so Plain includes examples from sample; Sample/Real omit redundant Example line.
- [x] **A.4** UI copy in `FormTemplatePayloadEditor`: Help → “Guidance (offline / on-screen help)”; clarify Sample also used as export Example on Plain.
- [x] **A.5** Seed SQL `SQL/v178_global_form_template_offline_guidance_seed.sql` — idempotent update of Admin global `form_template` payloads (start with **F001 Project Charter** General fields from your screenshot; reuse wording aligned with monorepo `v770b`). Other templates: short generic help where missing (optional phase or same file).
- [x] **A.6** Unit tests: section shaping includes help/example; PDF/Word smoke that guidance string appears in generated content where assertable.
- [x] **A.7** Update `Documentation/Global_Template_Export_Guide.md`.

### B — Platform + Simulator (`E:\project-nidus`) — plan file `projectplan/v780_…`

- [ ] **B.1** Same export rendering in monorepo `packages/shared/src/utils/exportUtils.js` (+ app duplicates if still present) — parity with Admin A.2.
- [ ] **B.2** When wiring / extending form template or form-instance export (`v777` Part B or this plan): merge org `guidance_text` over schema `help` for descriptions; use sample default only for Plain “Example:” line (not for Completed Real).
- [ ] **B.3** Confirm Default Content tab copy mentions offline export uses Guidance (one-line helper).
- [ ] **B.4** Platform–Simulator parity (rule 34.1) on any UI/service change.
- [ ] **B.5** Unit tests for merge helper (schema help vs org guidance).
- [ ] **B.6** Doc note in `Documentation/Form_Template_Guidance_And_Sample_Defaults.md` + cross-link Admin export guide.

### Out of scope (unless you ask)

- New DB tables / new permission keys.
- Auto-AI generation of guidelines.
- Changing form fill UX beyond existing help-under-label.
- Full v777 Part B form export wiring beyond what’s needed to attach guidance (if Part B still not approved, Admin-only A ships first; B.1–B.2 land with or immediately after export wiring).

## Sequencing recommendation

1. **Approve this plan.**
2. Ship **Admin A** first (fixes the Charter PDF you showed). ✅
3. Ship **Monorepo B** with export parity (and fold into `v777` Part B if you prefer one export PR).

## Open decisions

1. **Example line source on Plain:** use field **Sample value** (Admin) / **Sample default** (org) — yes/no? (Recommended: yes.) → **Yes (implemented).**
2. **Scope of seed content:** F001 only first, or all F001–F068 with short generic help? (Recommended: **F001 full** + generic one-liner for others missing help.) → **Implemented.**
3. **Ship Admin-only first** while Platform/Sim export is still pending? (Recommended: yes.) → **Implemented (this delivery).**

## Review

### What shipped (Admin Part A)

1. `formTemplateExportUtils.js` — `includeExamples`, `getFieldGuidanceLines`, `truncateExportExample`, `composeGuidedExportValue`.
2. `exportUtils.js` — guidance under labels (Word/PPT/Print); guidance prefixed into value cells (PDF/Excel/CSV/XML/JSON); `help`/`example` preserved through numbering.
3. `ExportRecordMenu` — Plain mode passes `includeExamples: true`.
4. `FormTemplatePayloadEditor` — Guidance / Sample copy clarified.
5. `SQL/v178_global_form_template_offline_guidance_seed.sql` — F001 curated help+sample; generic help for other templates missing help.
6. Docs + 12 unit tests (all passing).

### Apply

`SQL/v178_global_form_template_offline_guidance_seed.sql` in Admin Supabase. Re-export F001 Plain Template PDF/Word to verify guidance lines.

### Follow-up

~~Monorepo **v780 Part B**~~ done.  
~~Generic help for non-F001~~ superseded by **v179 / monorepo v781** curated seeds for all templates.
