# Module documentation

Markdown files in this folder are the **source of truth** for admin documentation.

- On push to `main`, CI uploads `*.md` to Supabase Storage: `documentation/admin/{module}/`
- The in-app Documentation Centre reads from Storage at runtime (no redeploy needed)
- Admins with `docs.manage` can hotfix via **Documentation → Editor** (commit repo changes for permanent fixes)

## Guides

| Guide | File |
|-------|------|
| Error Investigation | [Error_Investigation_Guide.md](./Error_Investigation_Guide.md) |
| Error Release Readiness | [Error_Release_Readiness_Guide.md](./Error_Release_Readiness_Guide.md) |
