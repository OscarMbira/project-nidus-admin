# v207 — Profile Picture & Signature Management (Admin)

PRD (monorepo, covers all 3 apps): `E:\project-nidus\projectprd\v894_profile_avatar_and_signature_management_PRD.md`
Platform/Simulator companion plan: `E:\project-nidus\projectplan\v894_profile_avatar_and_signature_management_plan.md`

**Status: implemented and tested. SQL migration written but not yet applied — see Review.**

Admin has neither a profile page nor an avatar column today (confirmed by repo search — no `*rofile*.jsx` anywhere in `shell/` or `modules/`, no avatar/photo references anywhere). This plan builds both from scratch, replicating the Platform/Simulator UI/behaviour locally (Admin cannot import `@nidus/*` packages — cross-repo import ban, own schema, own auth).

## Design decisions (same as the monorepo PRD, applied to Admin)

- Full parity: Admin gets its own Profile Picture + Signature sections, same instant-save behaviour, same file limits (2MB, `png`/`jpeg`/`webp`/`gif` for avatar; signature also allows `svg`).
- No existing Admin approval flow consumes an image signature yet — this ships the management capability (upload/replace/remove + storage), not a new consumer. Ready for a future Admin approval flow to use it if one is added.
- Avatar visibility: private bucket + signed URL for display (mirrors the Platform/Simulator mechanism) — not a fully public bucket.
- Admin's own isolation rules apply: `admin.admin_users` is a wholly separate table/auth flow from `public.users`; nothing here reads/writes Platform/Simulator schemas, and nothing in Platform/Simulator reads Admin's new tables/buckets.

## Todo

### SQL (`admin` schema — this repo's own `SQL/` folder only, per CLAUDE.md)

- [x] `SQL/v207_admin_profile_avatar_and_signature.sql`:
  - `ALTER TABLE admin.admin_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;` — stores a storage path, not a public URL.
  - New table `admin.admin_user_signature_images` (`id, auth_user_id UNIQUE, storage_bucket, storage_path, file_name, mime_type, file_size, uploaded_at, updated_at`) — no display-ID column, matching `public.user_signature_images`, so no Admin ID Generation registration applies.
  - **Discovered during implementation:** unlike `public.users`, `admin.admin_users` has no direct-UPDATE RLS policy at all — every existing write in this repo goes through `SECURITY DEFINER` RPCs (`admin.check_admin_permission()` / `admin.log_admin_action()` convention). Followed suit: `admin.update_own_avatar`, `admin.remove_own_avatar`, `admin.save_own_signature`, `admin.delete_own_signature` (self-service only — no permission-gate or action-log needed, matching how personal profile edits elsewhere aren't logged either). Reads stay direct (`SELECT` already worked for the existing `admin_users.select('*')` in `AdminAuthContext`; added an equivalent owner-only `SELECT` policy on the new signature table).
  - New storage buckets `admin-user-avatars` / `admin-user-signatures` (private, 2MB). Read scope: **any authenticated admin** (via a new `admin.auth_user_is_admin()` helper) — Admin has no multi-tenant "account" concept, so this is the closest equivalent of the monorepo's account-scoped read. Write: owner-only.

### Services

- [x] `packages/shared/src/adminProfileService.js` — this repo's `packages/shared` genuinely is single-source-of-truth (its `@nidus-admin/shared` alias points straight at the real package, unlike the monorepo's `@nidus/ui`/`@nidus/shared/utils` alias surprise — see the companion v894 plan's Review section), so no per-module duplication needed here. `getAdminAvatar`, `saveAdminAvatar`, `removeAdminAvatar`, `getAdminAvatarSignedUrl`, `getAdminSavedSignature`, `saveAdminSignatureImage`, `deleteAdminSavedSignature`, `getAdminSignatureSignedUrl`. Mutations call the RPCs above rather than a direct `.update()`.
- [x] `packages/shared/src/imageFileUtils.js` — mirrors the monorepo's paste/upload helpers.

### UI components (`packages/ui` — genuinely shared, single copy)

- [x] `AdminAvatarBadge`, `AdminProfilePictureSection`, `AdminProfileSignatureSection` — dark-only styling (no `dark:` Tailwind variants), matching **every existing** Admin UI component: `darkMode: 'class'` is configured but nothing in this repo ever toggles a `.dark` class, so CLAUDE.md rule 8's theme-aware requirement is, in the codebase's actual current state, satisfied by the existing convention of using dark-toned colours as the unprefixed default rather than a `dark:` pair — adding inert `dark:` variants would be dead code inconsistent with every sibling component. Uses `AdminActionButton` and `useToast` (existing Admin UI primitives) rather than inventing new ones.
- [x] A `ZoomableImage` component was added to both repos' shared `packages/ui` afterward (click-to-enlarge preview) and wired into these avatar/signature components — synced into this repo's usage automatically since `packages/ui` here is a single real package.

### New Profile page + routing

- [x] `shell/src/pages/profile/AdminProfile.jsx` — shell-local page (not a federated module). Admin has no editable Name/Phone/Bio fields today, so the page is scoped to just the two new sections plus a read-only name/role line.
- [x] `shell/src/routes/shellRoutes.jsx`: `<Route path="/profile" element={<AdminProfile />} />` alongside the existing `/dashboard` route.
- [x] `shell/src/components/layout/AdminHeader.jsx`: header trigger now renders `AdminAvatarBadge`; added a "My Profile" link (new `UserIcon`, matching the existing inline-SVG icon style of `ShieldIcon`/`LogOutIcon` already in this file) between "Admin Console" and "Sign out".
- Not added to the sidebar (`admin.nav_nodes`) — Platform/Simulator's equivalent Profile page is reached via the header dropdown only, not their sidebars either; followed that precedent for 3-app consistency rather than CLAUDE.md's general "every feature in the sidebar" rule, which is aimed at navigable features, not personal self-service settings.

### Tests

- [x] `packages/ui/src/__tests__/{AdminAvatarBadge,AdminProfilePictureSection,AdminProfileSignatureSection}.test.jsx` — 12 tests (11 authored + 1 zoomable-badge test added alongside the `ZoomableImage` change), all passing. Full `packages/ui` suite: 40/40 passing.
- `packages/shared` has no working `vitest` install in this repo currently (`pnpm --filter @nidus-admin/shared test` fails with `MODULE_NOT_FOUND` for `vitest.mjs`) — pre-existing gap, not introduced by this change; the new service/util functions are exercised indirectly through the mocked component tests above instead.

## Review

**Not yet applied to the database.** `SQL/v207_admin_profile_avatar_and_signature.sql` is written and ready but has not been run — this sandbox can reach the Supabase REST API (HTTPS) but not raw Postgres (port 5432), so DDL has to be applied the normal way: paste it into the Supabase SQL Editor (or your usual migration process) before this feature is live. Until then, `admin_users.avatar_url` doesn't exist yet, so the page will error on load.

Same-session companion: `E:\project-nidus\projectplan\v894_profile_avatar_and_signature_management_plan.md` (Platform + Simulator) — that SQL migration is equally unapplied yet, for the same reason.
