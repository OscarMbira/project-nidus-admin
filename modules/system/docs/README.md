# Module documentation

Markdown files in this folder are the **source of truth** for admin documentation.

- On push to `main`, CI uploads `*.md` to Supabase Storage: `documentation/admin/{module}/`
- The in-app Documentation Centre reads from Storage at runtime (no redeploy needed)
- Admins with `docs.manage` can hotfix via **Documentation → Editor** (commit repo changes for permanent fixes)

## Guides

| Guide | File |
|-------|------|
| System Settings | [System_Settings_Guide.md](./System_Settings_Guide.md) |
| ID Generation: Capacity & Uniqueness | [ID_Generation_Capacity_Guide.md](./ID_Generation_Capacity_Guide.md) |
