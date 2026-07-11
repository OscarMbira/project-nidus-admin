# Sidebar Navigation Management

Admin documentation for renaming sidebar labels and managing per-role visibility without SQL migrations.

## Overview

The admin sidebar is driven by `admin.nav_nodes` in Supabase. Before this feature, every label rename or visibility tweak required a hand-written SQL migration. **Navigation Management** (`/admin-mgmt/navigation-management`) lets Super Admins with the `nav.configure` permission:

- Rename any section, group, or item **label** (routing uses stable `node_key` values — renames do not break paths).
- Toggle which admin roles can see each node (`super_admin`, `system_admin`, `support_admin`, `content_admin`).
- Hide a node entirely for all roles via the **Active** toggle (`is_active = false`).

Structural changes — adding nodes, deleting nodes, changing `path`, `node_type`, or `sort_order` — still require SQL and `defaultAdminNav.js` / seed regeneration.

## Permissions

| Permission | Granted to | Purpose |
|---|---|---|
| `nav.configure` | `super_admin` (initially) | Use Navigation Management and call nav mutation RPCs |

Other admin roles can still see the sidebar according to each node's `roles[]` array; they cannot open the management screen unless granted `nav.configure`.

## Using the page

1. Open **Admin Management → Access Control → Navigation Management**.
2. Use the **search box** above the table to filter by label, route path, node key, or type. Matching rows include their parent and child nodes so hierarchy stays readable.
3. **Rename:** edit the label field and press Enter or click away (blur). Changes save immediately and refresh the sidebar for your session.
4. **Role visibility:** check or uncheck role columns. An empty role selection (all four checked, stored as `{}` in the database) means **every admin role** can see the node.
5. **Active:** uncheck **Active** to hide the node from all roles, including Super Admin.
6. Click **Save Changes** after editing role or active columns (labels save on blur).

## Audit trail

Mutations are logged via `admin.log_admin_action`:

- `nav_node.rename`
- `nav_node.set_roles`
- `nav_node.set_active`

Review entries under **Audit → Audit Trail**.

## Fallback navigation

`packages/shared/src/defaultAdminNav.js` is used only when the nav RPC fails or returns no rows. After a rename in the database, the fallback file is **not** updated automatically — that is acceptable because the fallback is never shown when the database is healthy.

## Related SQL

| File | Purpose |
|---|---|
| `SQL/v121_nav_node_management.sql` | `nav.configure` permission and management RPCs |
| `SQL/v122_nav_node_management_seed_data.sql` | Navigation Management menu entry and documentation guide |

Apply with:

```bash
pnpm run admin:migrate-nav-management
pnpm run admin:seed-nav-management
```
