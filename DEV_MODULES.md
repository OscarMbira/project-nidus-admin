.# Starting Individual Modules

`pnpm run dev` only starts the light set (shell, platform, users, admin-mgmt).
`pnpm run dev:full` starts everything.

**Focused combos (repo scripts):**

| Script | Modules |
|---|---|
| `pnpm run dev:subscriptions` | shell + subscriptions (port **5181**) |
| `pnpm run dev:system` | shell + system (port **5182**) |
| `pnpm run dev:system-subscriptions` | shell + system + subscriptions |

To start **any single module** (or a custom combo) instead, use `turbo dev --filter=<package-name>`,
always paired with `@nidus-admin/shell` unless the shell is already running separately.

> Run `node scripts/kill-dev-ports.js` first if ports are stuck from a previous run
> (that's what `pnpm run dev` / `dev:full` do automatically before starting).

## Shell (always needed as the host)

```bash
pnpm exec turbo dev --filter=@nidus-admin/shell
```
Port: **5175**

## Light-set modules (already covered by `pnpm run dev`)

| Module | Port | Command |
|---|---|---|
| platform | 5186 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/platform` |
| users | 5180 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/users` |
| admin-mgmt | 5192 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/admin-mgmt` |

## All other modules (need `dev:full` or an individual command below)

| Module | Port | Command |
|---|---|---|
| subscriptions | 5181 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/subscriptions` |
| system | 5182 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/system` |
| support | 5183 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/support` |
| errors | 5184 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/errors` |
| mirrors | 5185 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/mirrors` |
| simulator | 5187 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/simulator` |
| security | 5188 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/security` |
| content | 5189 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/content` |
| feedback | 5190 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/feedback` |
| audit | 5191 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/audit` |
| batch-ops | 5193 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/batch-ops` |
| affiliates | 5194 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/affiliates` |
| system-testers | 5195 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/system-testers` |
| docs-centre | 5196 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/docs-centre` |
| testing-centre | 5197 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/testing-centre` |
| email-centre | 5198 | `pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/email-centre` |

## Multiple modules at once

Chain `--filter` flags, e.g. shell + docs-centre + testing-centre:

```bash
pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/docs-centre --filter=@nidus-admin/testing-centre
```

## Notes

- Remote modules run `vite build` + `vite preview` under the hood (not `vite dev`), so `remoteEntry.js` is served correctly for Module Federation — this is handled automatically by each module's `dev` script, no extra flags needed.
- Module → package name mapping lives in `modules/*/package.json` (`name` field); ports are defined per-module and mirrored in `shell/src/moduleConfig.js`.
- If you add a new module, add its row here and to `shell/src/moduleConfig.js`.
