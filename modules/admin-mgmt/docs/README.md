# Module documentation

Markdown files in this folder are the **source of truth** for admin documentation.

- On push to `main`, CI uploads `*.md` to Supabase Storage: `documentation/admin/{module}/`
- The in-app Documentation Centre reads from Storage at runtime (no redeploy needed)
- Admins with `docs.manage` can hotfix via **Documentation → Editor** (commit repo changes for permanent fixes)

## Guides

| Guide | Description |
|---|---|
| [Admin Management Guide](./Admin_Management_Guide.md) | Admin users, roles, permissions, sessions |
| [Navigation Management Guide](./Navigation_Management_Guide.md) | Rename sidebar labels and manage per-role nav visibility |
| [Record Lifecycle Guide](./Record_Lifecycle_Guide.md) | Maker-checker governance, authorisers, lifecycle states |
