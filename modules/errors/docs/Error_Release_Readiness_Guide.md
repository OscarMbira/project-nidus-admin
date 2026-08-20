# Error Release Readiness

The admin console surfaces a **Release Readiness** indicator so developers can see at a glance whether known open errors should block a release.

## Where it appears

- **Error Dashboard** — full banner at the top of the triage view (`/errors/error-dashboard`).
- **Admin Dashboard** — compact card for roles with `errors.dashboard.view`.

The banner calls `admin.get_error_readiness_summary()` and compares counts against a configurable severity threshold.

## What counts as “open”

Open errors are aggregations with status:

- `new`
- `acknowledged`
- `investigating`
- `recurring`

These statuses mean the issue still needs attention or may regress.

## What does **not** block release

| Status | Meaning |
|--------|---------|
| `resolved` | An admin marked the error fixed. It does not count toward readiness until/unless it recurs (`recurring`). |
| `ignored` | An admin explicitly decided the error is not blocking (noise, accepted risk, external dependency, etc.). |

## Severity threshold setting

**Key:** `errors.release_gate_severity_threshold`  
**Category:** `errors` (System Settings)  
**Default:** `critical`

Accepted values:

- `critical` — any open **critical** error blocks release readiness.
- `critical,high` — open **critical** or **high** errors block.

Update via **System → System Settings** (requires `system.settings.edit`). The RPC only returns counts; policy lives in this setting so you can tighten or relax the gate without a migration.

## Resolving errors (permission fix)

Status and severity changes require `errors.status.manage` (granted to `super_admin`, `system_admin`, and `support_admin`). Use **Error Detail** or the dashboard **Update status** action, then confirm the readiness banner clears.

## Related settings

Auto-ticket thresholds (separate from release readiness):

| Key | Default | Purpose |
|-----|---------|---------|
| `errors.auto_ticket_user_threshold` | `3` | Unique users in window |
| `errors.auto_ticket_count_threshold` | `10` | Occurrences in window |
| `errors.auto_ticket_window_minutes` | `60` | Evaluation window |

## Manual verification checklist

1. Apply SQL migrations `v151` and `v152`.
2. As `support_admin`, resolve an error on **Error Detail** — no “Permission denied: errors.edit”.
3. With an open critical error, banner shows **Not release ready**.
4. After resolving (or ignoring) all blocking severities, banner shows **Release ready**.
5. Change threshold to `critical,high` and confirm high-severity open errors also block.

## Out of scope

- **Testing Centre defects** — separate from `error_aggregations`; linking is a future enhancement.
- **CI deploy gates** — this is an in-app signal for humans, not a GitHub Actions blocker.
