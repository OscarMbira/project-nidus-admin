# project-nidus-admin

Standalone admin application for Project Nidus — separate codebase, separate deployment, invite-only access with mandatory 2FA.

## Dev startup

```bash
cd "E:\project-nidus-admin"
pnpm install
pnpm run dev          # Shell (5175) + light set (platform, users, admin-mgmt)
pnpm run dev:full     # Shell (5175) + all modules (5180-5199)
```

Focused module dev:

```bash
pnpm turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/users
```

One-click (all systems): `E:\Hifo\AI Business\dev-start-all.bat` — **local dev only, never commit or deploy**.

## Module port registry

| Module | Port |
|--------|------|
| Shell | 5175 |
| users | 5180 |
| subscriptions | 5181 |
| system | 5182 |
| support | 5183 |
| errors | 5184 |
| mirrors | 5185 |
| platform | 5186 |
| simulator | 5187 |
| security | 5188 |
| content | 5189 |
| feedback | 5190 |
| audit | 5191 |
| admin-mgmt | 5192 |

## New module

Copy `modules/_template/` to `modules/<name>/`, update `package.json`, `vite.config.js`, register in `shell/src/moduleConfig.js` and `shell/src/routes/shellRoutes.jsx`.

## Super Admin seed (one-time)

```bash
pnpm run admin:seed-super
```

## Deployment

Each module deploys independently via CI/CD. Shell loads remotes from env vars — no shell redeploy when a module updates. Rollback: change module URL env var (< 60 seconds).

## SQL

Run migrations from `E:\project-nidus\SQL\v735_*.sql` in numeric order against Supabase.
