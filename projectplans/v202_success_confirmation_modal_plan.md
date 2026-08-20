# v202 — Success Confirmation Modal (Admin) — Implementation Plan

**PRD:** `E:\project-nidus\projectprd\v861_success_confirmation_modal_PRD.md` (shared PRD, monorepo-hosted — read that first for the "why").
**Monorepo companion plan:** `E:\project-nidus\projectplan\v861_success_confirmation_modal_plan.md` (Platform/Simulator implementation — separate code, same design intent).
**Repo:** `E:\project-nidus-admin` only.
**Status:** DRAFT — awaiting user confirmation (CLAUDE.md rule 3, monorepo — Admin's own CLAUDE.md rule 9 also requires a plan for non-trivial changes). Do not begin implementation until confirmed.

---

## Guiding constraints (from Admin's CLAUDE.md + PRD)

- No shared code with the monorepo — the cross-codebase import ban (Admin rule 34.5 equivalent / monorepo rule 46) means this is a parallel, independently-built implementation of the same UX pattern.
- Reuse the existing `AdminModal` component as-is — its single-button "Close" footer mode (when `onConfirm` is omitted, `cancelLabel` becomes the button's own label) already provides exactly the single-OK-button behavior needed, with **zero changes to `AdminModal.jsx` itself**.
- Mirror the existing `useConfirmAction()` hook shape (`packages/ui/src/useConfirmAction.jsx`) as closely as possible — same local-hook-per-page pattern, same `{ action, modal }`-style return, so Admin developers already familiar with `useConfirmAction` immediately recognize `useSuccessModal`.
- Theme-aware by construction (inherits `AdminModal`'s existing dark/light classes).
- This plan does NOT attempt the full ~230-call-site `showSuccess()` toast sweep — foundation + a small starting batch only, per the monorepo PRD's D2 (opportunistic migration).

---

## Phase 1 — Shared hook (Admin-local)

- [ ] **1.1** `packages/ui/src/useSuccessModal.jsx` (new) — mirrors `useConfirmAction.jsx`'s structure:
  ```js
  export function useSuccessModal() {
    const [state, setState] = useState(null)
    const showSuccess = ({ title = 'Success', message, recordId, operation, onOk, okLabel = 'OK' }) => {
      setState({ title, message, recordId, operation, onOk, okLabel })
    }
    const close = () => setState(null)
    const handleOk = () => {
      const onOk = state?.onOk
      close()
      onOk?.()
    }
    const modal = state ? (
      <AdminModal open title={state.title} onClose={handleOk} cancelLabel={state.okLabel}>
        {/* icon by operation, message, display ID + Copy-ID action */}
      </AdminModal>
    ) : null
    return { showSuccess, modal }
  }
  ```
  Note the `onConfirm` prop is deliberately omitted from the `<AdminModal>` call — this is what makes `AdminModal` render a single button (labelled via `cancelLabel`, here repurposed as the OK label) instead of a Cancel/Confirm pair.
- [ ] **1.2** Icon/color by operation inside the modal body: green check for created/updated, amber/red for deleted — same visual language decision as the monorepo side (PRD D7), implemented independently in Admin's own icon set.
- [ ] **1.3** "Copy ID" action next to the displayed record ID (clipboard) — same UX as the monorepo side.
- [ ] **1.4** Export `useSuccessModal` from `packages/ui/src/index.js` (or equivalent barrel) if one exists — check current export pattern for `useConfirmAction` first and match it exactly.
- [ ] **1.5** Unit/component test — new hook opens with correct content, OK closes and calls `onOk` after close (not before), no `onOk` closes cleanly, `AdminModal` receives no `onConfirm` (confirming single-button mode is actually engaged, not accidentally a two-button dialog).

## Phase 2 — Fix a small starting batch (mirrors monorepo PRD D5, Admin-appropriate targets)

- [ ] **2.1** Audit: pick 2-3 Admin CRUD pages currently using `showSuccess()` from `AdminToast` for a genuinely significant create/update/delete action (not a minor toggle) — e.g. `AdminUserEditPage.jsx` (already identified in research as a plain `showSuccess('Admin user updated successfully.')` call with no record ID surfaced). Confirm the actual candidate list before starting (facts to look up, not decide in advance).
- [ ] **2.2** Migrate the chosen 2-3 pages from `showSuccess()` to `useSuccessModal()` — include the record's `display_id` (Admin CLAUDE.md rule 13) in the modal, not just a generic message string.
- [ ] **2.3** Regression tests for the migrated pages.

## Phase 3 — CLAUDE.md rule update (opportunistic migration trigger)

- [ ] **3.1** Update `E:\project-nidus-admin\CLAUDE.md` rule 13 (or add an adjacent rule) to mandate `useSuccessModal()` for all NEW and AMENDED create/update/delete flows, explicitly noting this supersedes `showSuccess()` toast for CRUD confirmations specifically — toast remains correct for errors/warnings/non-CRUD info, matching the monorepo PRD's D1/O4 scope boundary. State the opportunistic-migration expectation explicitly (existing ~230 call sites migrate when next touched).
- [ ] **3.2** Add a short module doc (per Admin's own "Documentation & Testing" rule 1-2 — `modules/docs-centre/docs/general/` or the most relevant module's `docs/`) describing the new hook and its relationship to `useConfirmAction`/`AdminToast`. Register it in `admin.documentation_guides` via seed SQL if that's the established pattern for new guides (check rule 2 in Admin's CLAUDE.md before writing the seed).

## Phase 4 — Verification & rollout

- [ ] **4.1** Manual browser test: trigger a save on each of the Phase 2 migrated pages — confirm modal content, OK button behavior, dark/light theme.
- [ ] **4.2** Run Admin's test suite for the touched files — confirm no regressions.
- [ ] **4.3** Push to `origin/main` — Admin's CLAUDE.md already grants standing authorization to push at a completed feature/phase checkpoint (unlike the monorepo, which waits for explicit request) — apply that existing policy once this plan's checklist is fully checked off.

## Review section (fill in after implementation)

_To be completed once work is done: summary of changes, files touched, deviations from plan, and confirmation that the opportunistic-migration expectation (not a full sweep of ~230 call sites) was preserved._
