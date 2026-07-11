# v735 — Independent Admin System (project-nidus-admin)

## Objective

Build a **separate, standalone admin application** (`project-nidus-admin`) for managing and supporting users across both the Platform and Simulator systems. The admin app is fully independent — separate codebase, separate deployment (non-obvious URL — see Security Architecture below), separate auth flow — providing a security boundary from the main applications. It connects to the same Supabase instance but uses a dedicated `admin` schema for admin-specific data.

## Security Architecture

### Admin URL — Non-Obvious, Not Guessable
- **DO NOT** use `admin.nidus.com` or any URL containing "admin"
- Deploy to a **non-obvious subdomain** such as `console-{random-slug}.nidus.com` or a completely separate domain (e.g., `nidus-ops.com`)
- The subdomain slug is generated once during initial deployment and stored as an env var — never published
- The login page shows **zero branding** — no logo, no "Admin Panel" text, no system name. Just a plain dark page with email + password fields
- No `robots.txt` entry, no sitemap inclusion, no public DNS record hints

### Zero Self-Registration — Invitation-Only Access
No admin account can be created through a web form. Every admin enters the system via one of two paths:

| Role | Onboarding Method |
|------|-------------------|
| **Super Admin** | **Seeded during initial deployment** via a one-time CLI setup script (`npm run admin:seed-super`) or direct DB migration. Only 1-2 accounts. Never created through the UI. |
| **System Admin** | Invited by Super Admin → time-limited email invite → account setup → mandatory 2FA → first login |
| **Support Admin** | Invited by Super Admin → same invite flow |
| **Content Admin** | Invited by Super Admin → same invite flow |

### Invitation Link Security
- **Token:** Cryptographically random, 64 characters (`crypto.randomBytes(32).toString('hex')`)
- **Expires:** 48 hours from creation (configurable by Super Admin, max 72 hours)
- **Single-use:** Invalidated immediately after first use (whether setup is completed or not)
- **Role-scoped:** Invite specifies the target role — cannot be changed or upgraded during setup
- **Revocable:** Super Admin can cancel any pending invite before it's used
- **URL format:** `/setup/{token}` — no hint that it's an admin setup page (not `/admin-setup`, `/invite`, etc.)
- **IP logged:** The IP that uses the invite is recorded

### Invite → Account Setup → Activation Flow (Two-Checkpoint System)
```
CHECKPOINT 1: Invitation & Registration
────────────────────────────────────────
1. Super Admin creates invite in admin panel
   → Selects: email, role, custom message (optional)
   → System generates 64-char token, stores in admin.admin_invitations
   → Emails invite link to recipient

2. Recipient clicks link within 48 hours
   → /setup/{token} page validates token (exists, not expired, not used)
   → If invalid/expired: generic "This link is no longer valid" message (no detail leak)
   → If valid: shows account setup form

3. Account setup form
   → Full name (pre-filled from invite, editable)
   → Set password (min 12 chars, complexity requirements)
   → Set up 2FA (mandatory — scan QR code for authenticator app)
   → Generate 10 backup recovery codes (must acknowledge they saved them)
   → Submit → creates admin.admin_users record with activation_status = 'pending_activation'
   → Token marked as used
   → User sees: "Account created successfully. Your account is pending activation
     by the Super Admin. You will receive an email once activated."
   → Super Admin receives notification: "New admin registration — pending your activation"

CHECKPOINT 2: Super Admin Activation (REQUIRED)
────────────────────────────────────────────────
4. Super Admin reviews the pending account
   → Admin Management → Pending Activations queue
   → Sees: name, email, role, registration date, IP used, 2FA status
   → Actions: Activate | Reject (with reason)
   → On Activate: activation_status → 'active', activated_by → super_admin_id, activated_at → NOW()
   → On Reject: activation_status → 'rejected', rejection_reason stored, account permanently locked
   → Activation/rejection logged to audit trail

5. Activated admin receives email
   → "Your admin account has been activated. You can now log in at [admin URL]."
   → Includes no URL hints — admin must already know the login URL from the invite email

6. First login (only possible after activation)
   → Login page checks activation_status = 'active' before allowing auth
   → If pending: "Your account is not yet activated. Contact the Super Admin."
   → If rejected: "Your account access has been denied." (no detail leak)
   → If active: Email + password → 2FA code → dashboard
   → Session starts with full audit logging
```

### Account Activation States
```
invited        → Invite sent, not yet registered
pending_activation → Registered + 2FA set up, awaiting Super Admin activation
active         → Fully activated by Super Admin, can log in
rejected       → Super Admin rejected the registration, permanently locked
suspended      → Was active, Super Admin suspended access (reversible)
deactivated    → Permanently deactivated (cannot be re-activated, must create new invite)
```

### Security Layers — Defence in Depth

The admin app uses **four tiers of security**. An attacker must defeat ALL tiers to gain access — breaching one tier alone achieves nothing.

#### Tier 1: Network-Level (attacker never sees the app)
1. **IP Allowlisting** — Only pre-approved IP addresses can reach the admin URL. All other traffic gets a generic 403. Managed via Cloudflare firewall rules or hosting provider (Vercel/Netlify edge rules). Super Admin maintains the allowlist.
2. **Geo-fencing** — Block all traffic from countries where no admin operates. Eliminates 90%+ of automated attacks.
3. **Cloudflare Zero Trust / Access** — Adds a pre-authentication gate before the app even loads. Attacker must pass Cloudflare's identity check (email-based or SSO) before seeing any page. Free tier available.
4. **No DNS hints** — Admin subdomain is not listed in public DNS records, not in `robots.txt`, not in sitemaps, not linked from any public page.

#### Tier 2: Application-Level (attacker sees login form but can't get in)
5. **Rate limiting:** Max 3 login attempts per IP per 15 minutes; IP blocked for 1 hour after.
6. **CAPTCHA:** Required after 2 failed attempts (Cloudflare Turnstile — privacy-friendly, free).
7. **Account lockout:** 5 failed attempts → account locked for 30 minutes (Super Admin can unlock).
8. **2FA mandatory:** Every login requires TOTP code — no "remember this device" bypass. Future: upgrade to WebAuthn/hardware keys (YubiKey).
9. **Password policy:** Min 12 chars, uppercase + lowercase + number + special char. No reuse of last 5 passwords.
10. **Zero self-registration:** No sign-up form exists. Invite-only + Super Admin activation (two checkpoints).
11. **Blank login page:** No branding, no system name, no logo — reveals nothing about what the app is.

#### Tier 3: Session-Level (attacker stole a session but can't use it)
12. **Session timeout:** 30 minutes of inactivity → auto-logout (configurable by Super Admin).
13. **Concurrent sessions:** Max 2 active sessions per admin.
14. **Session fingerprinting:** Sessions are bound to browser fingerprint + IP. If either changes mid-session, session is terminated and re-authentication is required.
15. **Time-based access windows:** Admin logins only allowed during configurable business hours (e.g., 06:00-22:00 local timezone). Off-hours attempts are blocked, not just logged.

#### Tier 4: Detection & Response (attacker got in but gets caught immediately)
16. **Real-time login alerts:** Every login (success or failure) sends SMS/email notification to Super Admin with IP, location, device, and timestamp.
17. **Anomaly alerts:** Unusual patterns trigger high-priority alerts — login from new IP, new country, off-hours, multiple failed attempts.
18. **IP logging:** Every action logged with IP, user agent, timestamp, geo-location.
19. **Immutable audit trail:** All admin actions append-only — no update, no delete. Even a compromised admin cannot erase evidence.
20. **Emergency lockdown:** Super Admin can instantly lock the entire admin app (all sessions terminated, all logins blocked) via a single action or an out-of-band mechanism (e.g., Supabase dashboard toggle).

### Infrastructure Security
- **Separate Supabase key:** Admin app uses a dedicated Supabase service role key, NOT the same anon key as Platform/Simulator. If the Platform key is leaked, admin access is unaffected.
- **Admin schema RLS:** The `admin` schema has its own RLS policies that only permit access from verified admin user sessions. Platform/Simulator clients cannot query admin tables even if they try.
- **CSP headers:** Strict Content Security Policy to prevent XSS — no inline scripts, no external script sources except explicitly allowlisted CDNs.
- **CORS lockdown:** Admin API only accepts requests from the admin app's exact origin — no cross-origin access.
- **Dependency auditing:** Automated `npm audit` in CI pipeline; block deploys with known critical vulnerabilities.

### Dev Server Configuration
The admin app is a **completely separate project** — it does NOT start when you run `pnpm run dev` in project-nidus.

**Individual startup (separate terminals):**
```
# Terminal 1 — Platform + Simulator (monorepo)
cd "E:\project-nidus"
pnpm run dev                    → Platform on port 5173, Simulator on port 5174

# Terminal 2 — Admin shell + all modules (admin mini-monorepo)
cd "E:\project-nidus-admin"
pnpm run dev                    → Shell on port 5175, modules on ports 5180-5192

# Terminal 2 (alt) — Admin shell + single module only (focused dev)
cd "E:\project-nidus-admin"
pnpm turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/users
```

**One-click development startup:**
A convenience batch file at `E:\hifo\dev-start-all.bat` launches all systems in separate terminal windows with one double-click. This file is **development-only** and must NEVER be deployed to production.

```bat
@echo off
:: ============================================================
:: dev-start-all.bat — DEV ONLY — launches all Nidus systems
:: DO NOT deploy to production. Delete before release packaging.
:: ============================================================

echo Starting Nidus Platform + Simulator...
start "Nidus Platform+Sim" cmd /k "cd /d E:\project-nidus && pnpm run dev"

echo Starting Nidus Admin (shell + all modules)...
start "Nidus Admin" cmd /k "cd /d E:\project-nidus-admin && pnpm run dev"

echo.
echo All systems starting:
echo   Platform     → http://localhost:5173
echo   Simulator    → http://localhost:5174
echo   Admin Shell  → http://localhost:5175
echo   Admin Modules → ports 5180-5192
echo.
echo Close this window or press any key to exit.
pause >nul
```

**Production safety — ensuring dev-start-all.bat is never deployed:**

1. **`.gitignore`** — `dev-start-all.bat` is added to `.gitignore` in BOTH `E:\project-nidus` and `E:\project-nidus-admin` repos so it is never committed
2. **CI/CD check** — The admin CI/CD pipeline (`.github/workflows/admin.yml`) includes a build step that **fails if `dev-start-all.bat` is found** in the deployment artifact:
   ```yaml
   - name: Verify no dev scripts in build
     run: |
       if [ -f "dev-start-all.bat" ]; then
         echo "ERROR: dev-start-all.bat found in build — remove before deploy"
         exit 1
       fi
   ```
3. **`.dockerignore`** (if containerised) — excludes `*.bat` files from Docker images
4. **Build script** — `npm run build` in the admin app does NOT copy `.bat` files to the `dist/` folder (Vite ignores them by default)
5. **README note** — Admin project README documents that `dev-start-all.bat` is local dev-only and must not be committed

They share the same Supabase instance but are otherwise fully independent — own codebase, own `package.json`, own CI/CD pipeline, own deployment.

## Why a Separate App

1. **Security boundary** — vulnerabilities in the main app don't expose admin capabilities
2. **Independent deploy** — admin updates don't require Platform/Simulator redeployment
3. **Architecture-proof** — unaffected by monolith → Turborepo → Module Federation migrations
4. **Audit isolation** — admin actions logged separately, immutable audit trail
5. **Access control** — separate URL, separate auth, separate session management
6. **Already planned** — v91 SQL migration explicitly deleted `system_admin` from main roles table with comment "separate admin application"

## Existing Foundation (already in DB)

| Asset | Source | Notes |
|-------|--------|-------|
| `admin_activity_log` table | v80 SQL | Admin action audit trail |
| `admin_dashboard_widgets` table | v80 SQL | Configurable admin dashboard |
| `admin_system_settings` table | v80 SQL | System-level config |
| 37 admin permissions | v80 SQL | PM Admin, Sim Admin, Security, Support, Monitoring categories |
| `audit_events` table | v52 SQL | System-wide audit events |
| `audit_settings` table | v52 SQL | Audit configuration |
| `system_settings` table | v02 SQL | Overlaps with `admin_system_settings` — consolidate |
| `system_admin` role removed from `public.roles` | v91 SQL | Explicitly reserved for separate admin app |
| `supportTicketService.js` | Existing service | Support ticket logic (to be migrated) |
| `pmoAdminService.js` | Existing service | Org/user admin logic (to be migrated) |

## The 4 Admin Roles

| # | Role ID | Display Name | Access Level | Status |
|---|---------|-------------|-------------|--------|
| 1 | `super_admin` | Super Admin | Full system — manage admins, system config, deploy controls, take system offline | **Active** |
| 2 | `system_admin` | System Admin | User/org management, subscription pricing, system health, DB maintenance. Cannot manage other admins | **Active** |
| 3 | `support_admin` | Support Admin | View user accounts, reset passwords, adjust individual subscriptions, handle support tickets, user impersonation for debugging | **Active** |
| 4 | `content_admin` | Content Admin | Simulator content only — scenarios, learning paths, certificates, leaderboard resets, NPC templates. No billing or user data access | **Passive** (built but not staffed initially) |

### Role Hierarchy & Inheritance

```
super_admin
  ├── system_admin (inherits all except admin management)
  │     ├── support_admin (inherits read-only system view + user operations)
  │     └── content_admin (simulator content only, no user/billing access)
```

- **Super Admin** can do everything any other role can do
- **System Admin** can do everything Support Admin and Content Admin can do
- **Support Admin** and **Content Admin** are peers — neither inherits from the other
- Role inheritance is enforced at the permission level, not via nested role checks

---

## Implementation Phases

### Phase 0: Project Scaffolding
**Goal:** Create the standalone admin app with its own build, dev server, and deployment pipeline.

#### 0A — Modular Architecture Design

The Admin app follows the same **Module Federation** pattern used by Platform/Simulator (v731). The app is structured as a **shell + federated modules**, where each admin section is an independently deployable module.

- [x] **0A.1** Define Admin module registry:

  | Module | Package Name | Port (Dev) | Contains | Deploy Independently |
  |--------|-------------|-----------|----------|---------------------|
  | **Shell** | `@nidus-admin/shell` | 5175 | Layout, sidebar, auth, routing, dashboard | Only when shell changes |
  | **Users** | `@nidus-admin/users` | 5180 | User & org management (Phase 4) | Yes |
  | **Subscriptions** | `@nidus-admin/subscriptions` | 5181 | Subscription & billing (Phase 5) | Yes |
  | **System** | `@nidus-admin/system` | 5182 | Settings, feature flags, maintenance (Phase 6) | Yes |
  | **Support** | `@nidus-admin/support` | 5183 | Tickets, impersonation, announcements (Phase 7) | Yes |
  | **Errors** | `@nidus-admin/errors` | 5184 | Error monitoring & auto-ticketing (Phase 7B) | Yes |
  | **Mirrors** | `@nidus-admin/mirrors` | 5185 | Platform & Simulator menu mirrors (Phase 8) | Yes |
  | **Platform** | `@nidus-admin/platform` | 5186 | Platform admin section (Phase 9) | Yes |
  | **Simulator** | `@nidus-admin/simulator` | 5187 | Simulator admin section (Phase 10) | Yes |
  | **Security** | `@nidus-admin/security` | 5188 | Security, SSO, GDPR, performance (Phase 11) | Yes |
  | **Content** | `@nidus-admin/content` | 5189 | Docs CMS, help articles, PWA, menus (Phase 12) | Yes |
  | **Feedback** | `@nidus-admin/feedback` | 5190 | Bug tracking, feature requests, backlog (Phase 13) | Yes |
  | **Audit** | `@nidus-admin/audit` | 5191 | Audit trail, admin activity, export (Phase 14) | Yes |
  | **Admin Mgmt** | `@nidus-admin/admin-mgmt` | 5192 | Admin user CRUD, roles, sessions (Phase 15) | Yes |

- [x] **0A.2** Define what lives in the shell vs modules:

  **Shell (`@nidus-admin/shell`) owns:**
  - `AdminLayout.jsx`, `AdminSidebar.jsx`, `AdminHeader.jsx`
  - `AdminAuthContext.jsx` — auth, 2FA, session management
  - `RoleGuard.jsx`, `PermissionGuard.jsx`
  - `useAdminAuth.js`, `usePermission.js`, `useAuditLog.js`
  - `adminClient.js` — Supabase client
  - `adminRoles.js`, `adminPermissions.js` — constants
  - `moduleConfig.js` — module URL registry
  - `AdminDashboard.jsx` — role-specific dashboard
  - Auth pages (login, setup, 2FA, pending activation)
  - Admin settings/profile page
  - `ModuleErrorBoundary.jsx` — catches module load failures without crashing the shell

  **Each module owns:**
  - Its own pages, services, and components
  - Its own `package.json` and `vite.config.js` (with Module Federation plugin)
  - Its own CI/CD workflow file
  - Its own unit tests

  **Modules receive from shell (via shared dependencies):**
  - Auth context (current admin user, role, permissions)
  - Audit log hook (auto-log actions)
  - Supabase client
  - Permission checking utilities
  - Shared UI components (tables, forms, modals, badges)

#### 0B — Project Scaffolding

- [x] **0B.1** Create project directory: `E:\project-nidus-admin`
- [x] **0B.2** Initialise as pnpm workspace (mini-monorepo):
  ```yaml
  # pnpm-workspace.yaml
  packages:
    - 'shell'
    - 'modules/*'
    - 'packages/*'
  ```
- [x] **0B.3** Project structure:
  ```
  project-nidus-admin/
  ├── shell/                              # @nidus-admin/shell — the host app
  │   ├── public/
  │   ├── src/
  │   │   ├── main.jsx
  │   │   ├── App.jsx                     # Shell router — loads federated modules
  │   │   ├── moduleConfig.js             # Module remote URL registry
  │   │   ├── constants/
  │   │   │   ├── adminRoles.js
  │   │   │   └── adminPermissions.js
  │   │   ├── components/
  │   │   │   ├── layout/                 # AdminLayout, AdminSidebar, AdminHeader
  │   │   │   ├── guards/                # RoleGuard, PermissionGuard
  │   │   │   └── ModuleErrorBoundary.jsx
  │   │   ├── pages/
  │   │   │   ├── auth/                   # Login, 2FA, setup, pending activation
  │   │   │   ├── dashboard/             # Role-specific dashboard
  │   │   │   └── settings/              # Admin profile/preferences
  │   │   ├── context/
  │   │   │   └── AdminAuthContext.jsx
  │   │   ├── hooks/
  │   │   │   ├── useAdminAuth.js
  │   │   │   ├── usePermission.js
  │   │   │   └── useAuditLog.js
  │   │   ├── services/
  │   │   │   └── supabase/
  │   │   │       └── adminClient.js
  │   │   ├── routes/
  │   │   │   └── shellRoutes.jsx         # Auth + dashboard routes + module mount points
  │   │   └── utils/
  │   │       ├── permissions.js
  │   │       └── formatters.js
  │   ├── package.json
  │   ├── vite.config.js                  # Module Federation host config
  │   └── tailwind.config.js
  │
  ├── modules/                            # Federated remote modules
  │   ├── users/                          # @nidus-admin/users
  │   │   ├── src/
  │   │   │   ├── index.js                # Module entry — exports routes
  │   │   │   ├── pages/                  # UserListPage, UserDetailPage, OrgListPage, etc.
  │   │   │   ├── services/               # userService.js, orgService.js
  │   │   │   └── components/             # Module-specific components
  │   │   ├── package.json
  │   │   └── vite.config.js              # Module Federation remote config
  │   │
  │   ├── subscriptions/                  # @nidus-admin/subscriptions
  │   ├── system/                         # @nidus-admin/system
  │   ├── support/                        # @nidus-admin/support
  │   ├── errors/                         # @nidus-admin/errors
  │   ├── mirrors/                        # @nidus-admin/mirrors
  │   ├── platform/                       # @nidus-admin/platform
  │   ├── simulator/                      # @nidus-admin/simulator
  │   ├── security/                       # @nidus-admin/security
  │   ├── content/                        # @nidus-admin/content
  │   ├── feedback/                       # @nidus-admin/feedback
  │   ├── audit/                          # @nidus-admin/audit
  │   └── admin-mgmt/                     # @nidus-admin/admin-mgmt
  │
  ├── packages/                           # Shared code within admin mini-monorepo
  │   ├── ui/                             # @nidus-admin/ui — shared admin UI components
  │   │   ├── src/
  │   │   │   ├── AdminTable.jsx
  │   │   │   ├── AdminCard.jsx
  │   │   │   ├── AdminModal.jsx
  │   │   │   ├── AdminForm.jsx
  │   │   │   ├── AdminBadge.jsx
  │   │   │   └── AuditTrailWidget.jsx
  │   │   ├── package.json
  │   │   └── index.js
  │   └── shared/                         # @nidus-admin/shared — admin-specific utils
  │       ├── src/
  │       │   ├── formatters.js
  │       │   ├── validators.js
  │       │   └── constants.js
  │       ├── package.json
  │       └── index.js
  │
  ├── .github/
  │   └── workflows/
  │       ├── admin-shell.yml             # Shell CI/CD
  │       ├── admin-users.yml             # Users module CI/CD
  │       ├── admin-subscriptions.yml     # Subscriptions module CI/CD
  │       ├── admin-system.yml            # System module CI/CD
  │       ├── admin-support.yml           # Support module CI/CD
  │       ├── admin-errors.yml            # Errors module CI/CD
  │       ├── admin-mirrors.yml           # Mirrors module CI/CD
  │       ├── admin-platform.yml          # Platform module CI/CD
  │       ├── admin-simulator.yml         # Simulator module CI/CD
  │       ├── admin-security.yml          # Security module CI/CD
  │       ├── admin-content.yml           # Content module CI/CD
  │       ├── admin-feedback.yml          # Feedback module CI/CD
  │       ├── admin-audit.yml             # Audit module CI/CD
  │       └── admin-admin-mgmt.yml        # Admin Mgmt module CI/CD
  │
  ├── scripts/
  │   └── seed-super-admin.js             # CLI: npm run admin:seed-super
  │
  ├── pnpm-workspace.yaml
  ├── turbo.json                          # Turborepo config for admin monorepo
  ├── package.json                        # Root package.json
  ├── .env.example
  ├── .env.local
  ├── CLAUDE.md                           # Admin-specific dev instructions
  └── README.md
  ```

- [x] **0B.4** Configure Vite Module Federation for the shell (`shell/vite.config.js`):
  ```js
  // Shell is the HOST — it consumes remote modules
  federation({
    name: 'admin_shell',
    remotes: {
      admin_users:         moduleConfig.ADMIN_USERS_URL,
      admin_subscriptions: moduleConfig.ADMIN_SUBSCRIPTIONS_URL,
      admin_system:        moduleConfig.ADMIN_SYSTEM_URL,
      admin_support:       moduleConfig.ADMIN_SUPPORT_URL,
      admin_errors:        moduleConfig.ADMIN_ERRORS_URL,
      admin_mirrors:       moduleConfig.ADMIN_MIRRORS_URL,
      admin_platform:      moduleConfig.ADMIN_PLATFORM_URL,
      admin_simulator:     moduleConfig.ADMIN_SIMULATOR_URL,
      admin_security:      moduleConfig.ADMIN_SECURITY_URL,
      admin_content:       moduleConfig.ADMIN_CONTENT_URL,
      admin_feedback:      moduleConfig.ADMIN_FEEDBACK_URL,
      admin_audit:         moduleConfig.ADMIN_AUDIT_URL,
      admin_admin_mgmt:    moduleConfig.ADMIN_ADMIN_MGMT_URL,
    },
    shared: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js']
  })
  ```

- [x] **0B.5** Configure Vite Module Federation for each module (template — `modules/<name>/vite.config.js`):
  ```js
  // Each module is a REMOTE — it exposes its routes
  federation({
    name: 'admin_<name>',
    filename: 'remoteEntry.js',
    exposes: {
      './routes': './src/index.js'    // exports the module's route component
    },
    shared: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js']
  })
  ```

- [x] **0B.6** Create `shell/src/moduleConfig.js` — module URL registry:
  ```js
  // Dev: each module runs on its own port
  // Prod: each module is deployed to its own CDN path
  export default {
    ADMIN_USERS_URL:         import.meta.env.VITE_ADMIN_USERS_URL         || 'http://localhost:5180/remoteEntry.js',
    ADMIN_SUBSCRIPTIONS_URL: import.meta.env.VITE_ADMIN_SUBSCRIPTIONS_URL || 'http://localhost:5181/remoteEntry.js',
    ADMIN_SYSTEM_URL:        import.meta.env.VITE_ADMIN_SYSTEM_URL        || 'http://localhost:5182/remoteEntry.js',
    // ... etc for all 13 modules
  };
  ```

- [x] **0B.7** Create shell route mount points — lazy-load each module:
  ```jsx
  // shell/src/routes/shellRoutes.jsx
  const UsersModule    = lazy(() => import('admin_users/routes'));
  const SubsModule     = lazy(() => import('admin_subscriptions/routes'));
  const SystemModule   = lazy(() => import('admin_system/routes'));
  // ... etc

  // Each module is wrapped in ModuleErrorBoundary
  <Route path="/users/*" element={
    <ModuleErrorBoundary module="users">
      <Suspense fallback={<ModuleLoader />}>
        <UsersModule />
      </Suspense>
    </ModuleErrorBoundary>
  } />
  ```

- [x] **0B.8** Create module scaffold template (`modules/_template/`):
  - Pre-configured `package.json`, `vite.config.js`, `src/index.js`
  - New modules are created by copying this template
  - Template includes: pages folder, services folder, components folder, unit test setup

#### 0C — Infrastructure Setup

- [x] **0C.1** Configure Supabase client in shell — connects to same Supabase instance, accesses `public`, `sim`, and `admin` schemas
- [x] **0C.2** Configure Turborepo (`turbo.json`) for admin mini-monorepo:
  ```json
  {
    "pipeline": {
      "build": { "dependsOn": ["^build"] },
      "dev": { "cache": false },
      "test": { "dependsOn": ["build"] }
    }
  }
  ```
- [x] **0C.3** Configure shell dev server on port `5175`; modules on ports `5180-5192`
- [x] **0C.4** Create CI/CD workflow for shell (`.github/workflows/admin-shell.yml`)
- [x] **0C.5** Create CI/CD workflow template for modules — each module gets its own workflow that:
  - Triggers only when files in that module's directory change
  - Builds only that module
  - Deploys only that module's `remoteEntry.js` to CDN
  - Shell does NOT need redeployment when a module updates
- [x] **0C.6** Create `.env.example` with required env vars (SUPABASE_URL, SUPABASE_ADMIN_KEY, module URLs)
- [x] **0C.7** Add basic Tailwind dark theme config in `packages/ui/` (admin default = dark, matching rule 28)

#### 0D — Dev Experience

- [x] **0D.1** Create `E:\hifo\dev-start-all.bat` — one-click dev startup:
  ```bat
  @echo off
  :: Launches Platform+Simulator and Admin shell+modules
  :: DEV ONLY — DO NOT deploy to production
  start "Nidus Platform+Sim" cmd /k "cd /d E:\project-nidus && pnpm run dev"
  start "Nidus Admin" cmd /k "cd /d E:\project-nidus-admin && pnpm run dev"
  echo All systems starting...
  echo   Platform  → http://localhost:5173
  echo   Simulator → http://localhost:5174
  echo   Admin Shell → http://localhost:5175
  echo   Admin Modules → http://localhost:5180-5192
  pause >nul
  ```
  - `pnpm run dev` in admin root starts shell + all modules via Turborepo
  - Individual module dev: `pnpm turbo dev --filter=@nidus-admin/users` starts just users module + shell

- [x] **0D.2** Add `dev-start-all.bat` to `.gitignore` in both repos
- [x] **0D.3** Add CI/CD guard — fail build if `dev-start-all.bat` is found in deployment artifact
- [x] **0D.4** Document in admin project README:
  - `dev-start-all.bat` is local dev-only
  - How to start individual modules for focused development
  - Module port registry
  - How to create a new module from template

#### 0E — Module Deployment & Rollback

- [x] **0E.1** Document deployment flow per module:
  ```
  1. Change code in modules/<name>/
  2. pnpm turbo build --filter=@nidus-admin/<name>
  3. CI/CD deploys new remoteEntry.js to CDN (e.g., cdn.nidus.com/admin/<name>/v1.2.3/)
  4. Update module URL env var to point to new version (or use "latest" for auto-pickup)
  5. Shell loads new module on next page refresh — no shell redeploy needed
  ```

- [x] **0E.2** Document rollback flow:
  ```
  1. Change module URL env var back to previous version
  2. Shell loads old module on next page refresh
  3. Rollback time: < 60 seconds (just a URL change)
  ```

- [x] **0E.3** Create `ModuleErrorBoundary.jsx` in shell:
  - If a module fails to load (CDN down, bad build): shows "This section is temporarily unavailable" instead of crashing the entire admin app
  - Logs the error to `admin.system_error_log` (Phase 7B)
  - Other modules continue working normally

---

### Phase 1: Admin Schema & Roles (DB)
**Goal:** Dedicated `admin` schema with role and permission tables, separate from Platform/Simulator auth.

- [x] **1.1** SQL: Create `admin` schema:
  ```sql
  CREATE SCHEMA IF NOT EXISTS admin;
  ```

- [x] **1.2** SQL: Create `admin.admin_users` table:
  ```sql
  admin.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id),   -- links to Supabase Auth
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'system_admin', 'support_admin', 'content_admin')),
    activation_status VARCHAR(30) NOT NULL DEFAULT 'invited'
      CHECK (activation_status IN ('invited', 'pending_activation', 'active', 'rejected', 'suspended', 'deactivated')),
    activated_by UUID REFERENCES admin.admin_users(id),    -- Super Admin who activated
    activated_at TIMESTAMPTZ,
    rejection_reason TEXT,                                  -- reason if rejected
    suspended_reason TEXT,                                  -- reason if suspended
    requires_2fa BOOLEAN DEFAULT true,
    is_2fa_configured BOOLEAN DEFAULT false,
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    registration_ip INET,                                  -- IP used during account setup
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_by UUID REFERENCES admin.admin_users(id),      -- Super Admin who sent the invite
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
  -- Login is ONLY allowed when activation_status = 'active'
  ```

- [x] **1.2.1** SQL: Create `admin.admin_invitations` table:
  ```sql
  admin.admin_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(128) UNIQUE NOT NULL,               -- 64-char hex token
    email VARCHAR(255) NOT NULL,
    target_role VARCHAR(50) NOT NULL CHECK (target_role IN ('system_admin', 'support_admin', 'content_admin')),
    custom_message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'used', 'expired', 'revoked')),
    invited_by UUID NOT NULL REFERENCES admin.admin_users(id),
    used_at TIMESTAMPTZ,
    used_by_ip INET,
    expires_at TIMESTAMPTZ NOT NULL,                  -- default 48hrs from creation
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  -- target_role excludes 'super_admin' — Super Admins are NEVER created via invite
  ```

- [x] **1.3** SQL: Create `admin.admin_permissions` table:
  ```sql
  admin.admin_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key VARCHAR(100) UNIQUE NOT NULL,     -- e.g., 'users.view', 'users.edit', 'system.maintenance'
    permission_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,                   -- 'users', 'subscriptions', 'system', 'platform', 'simulator', 'support', 'audit', 'content'
    description TEXT,
    is_active BOOLEAN DEFAULT true
  )
  ```

- [x] **1.4** SQL: Create `admin.role_permissions` table — maps roles to permissions:
  ```sql
  admin.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(50) NOT NULL,
    permission_key VARCHAR(100) NOT NULL REFERENCES admin.admin_permissions(permission_key),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES admin.admin_users(id),
    UNIQUE(role, permission_key)
  )
  ```

- [x] **1.5** SQL: Create `admin.admin_sessions` table — track active admin sessions:
  ```sql
  admin.admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES admin.admin_users(id),
    session_token VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
  )
  ```

- [x] **1.6** SQL: Create `admin.admin_audit_log` table — immutable audit trail for all admin actions:
  ```sql
  admin.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES admin.admin_users(id),
    admin_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,                    -- 'user.password_reset', 'subscription.update', 'system.maintenance_on'
    target_type VARCHAR(50),                         -- 'user', 'organisation', 'subscription', 'system_setting', 'scenario'
    target_id UUID,
    target_details JSONB,                            -- snapshot of what was changed
    previous_value JSONB,                            -- before state
    new_value JSONB,                                 -- after state
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  -- NO UPDATE or DELETE allowed — append-only
  ```

- [x] **1.7** SQL: Seed default permissions (organised by category):
  ```
  -- Users & Organisations
  users.view, users.edit, users.create, users.deactivate, users.password_reset, users.impersonate
  orgs.view, orgs.edit, orgs.verify, orgs.suspend

  -- Subscriptions & Billing
  subscriptions.view, subscriptions.edit, subscriptions.create, subscriptions.cancel, subscriptions.refund
  pricing.view, pricing.edit

  -- Platform Admin
  platform.projects.view, platform.projects.edit
  platform.settings.view, platform.settings.edit

  -- Simulator Admin
  simulator.scenarios.view, simulator.scenarios.edit, simulator.scenarios.create, simulator.scenarios.delete
  simulator.learning_paths.view, simulator.learning_paths.edit
  simulator.certificates.view, simulator.certificates.edit, simulator.certificates.revoke
  simulator.leaderboard.view, simulator.leaderboard.reset

  -- System
  system.settings.view, system.settings.edit
  system.maintenance.toggle
  system.feature_flags.view, system.feature_flags.edit
  system.deploy.view

  -- Support
  support.tickets.view, support.tickets.manage, support.tickets.assign
  support.announcements.create

  -- Audit
  audit.logs.view, audit.logs.export

  -- Admin Management (Super Admin only)
  admins.view, admins.create, admins.invite, admins.activate, admins.reject,
  admins.suspend, admins.reactivate, admins.deactivate, admins.roles.assign
  ```

- [x] **1.8** SQL: Seed role-permission mappings:

  | Permission Category | Super Admin | System Admin | Support Admin | Content Admin |
  |---------------------|:-----------:|:------------:|:-------------:|:-------------:|
  | Users & Orgs        | All         | All          | view + password_reset + impersonate | — |
  | Subscriptions       | All         | All          | view + edit (individual) | — |
  | Platform Admin      | All         | All          | view only | — |
  | Simulator Admin     | All         | All          | view only | All |
  | System              | All         | All except deploy | view only | — |
  | Support             | All         | All          | All | — |
  | Error Monitoring    | All         | All          | view + manage status | — |
  | Security & Compliance | All       | All          | view incidents only | — |
  | Content Management  | All         | All          | — | docs + help articles |
  | Feedback & Backlog  | All         | All          | bugs + requests + analysis | — |
  | Audit               | All         | All          | view only | — |
  | Admin Management    | All         | view only    | — | — |

- [x] **1.9** SQL: Seed admin roles definition table — `admin.admin_roles`:
  ```sql
  admin.admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_key VARCHAR(50) UNIQUE NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    role_description TEXT NOT NULL,
    access_level VARCHAR(20) NOT NULL,          -- 'full', 'elevated', 'standard', 'limited'
    is_active BOOLEAN DEFAULT true,
    can_be_invited BOOLEAN DEFAULT true,        -- false for super_admin (seeded only)
    max_accounts INTEGER,                       -- max users with this role (null = unlimited)
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  ```

- [x] **1.10** SQL: Seed admin roles data:
  ```sql
  INSERT INTO admin.admin_roles (role_key, role_name, role_description, access_level, can_be_invited, max_accounts)
  VALUES
    ('super_admin', 'Super Admin',
     'Full system access — manage other admins, system configuration, deployment controls, maintenance mode, emergency lockdown. The highest privilege level. Seeded during deployment, never created via invite.',
     'full', false, 2),

    ('system_admin', 'System Admin',
     'User and organisation management, subscription pricing and plans, system health monitoring, database maintenance, feature flags. Cannot manage other admin accounts or access deployment controls.',
     'elevated', true, null),

    ('support_admin', 'Support Admin',
     'User support operations — view user accounts, reset passwords, adjust individual subscriptions, manage support tickets, impersonate users for debugging, create announcements. Read-only access to system settings.',
     'standard', true, null),

    ('content_admin', 'Content Admin',
     'Simulator content management only — create and edit scenarios, learning paths, certificates, leaderboard administration, NPC template management. No access to user data, billing, or system settings.',
     'limited', true, null)
  ON CONFLICT (role_key) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    role_description = EXCLUDED.role_description,
    access_level = EXCLUDED.access_level,
    can_be_invited = EXCLUDED.can_be_invited,
    max_accounts = EXCLUDED.max_accounts;
  ```

- [x] **1.11** SQL: Seed all permissions with full INSERT statements:
  ```sql
  INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
  VALUES
    -- Users & Organisations (6 permissions)
    ('users.view',             'View Users',              'users',         'View user list and user profile details'),
    ('users.edit',             'Edit Users',              'users',         'Edit user profile information'),
    ('users.create',           'Create Users',            'users',         'Create new user accounts'),
    ('users.deactivate',       'Deactivate Users',        'users',         'Suspend or deactivate user accounts'),
    ('users.password_reset',   'Reset User Passwords',    'users',         'Trigger password reset for user accounts'),
    ('users.impersonate',      'Impersonate Users',       'users',         'Log in as a user to debug their issues'),
    ('orgs.view',              'View Organisations',      'users',         'View organisation list and details'),
    ('orgs.edit',              'Edit Organisations',      'users',         'Edit organisation information'),
    ('orgs.verify',            'Verify Organisations',    'users',         'Manually verify organisation accounts'),
    ('orgs.suspend',           'Suspend Organisations',   'users',         'Suspend organisation and all member access'),

    -- Subscriptions & Billing (7 permissions)
    ('subscriptions.view',     'View Subscriptions',      'subscriptions', 'View subscription list and details'),
    ('subscriptions.edit',     'Edit Subscriptions',      'subscriptions', 'Modify individual subscription plans'),
    ('subscriptions.create',   'Create Subscriptions',    'subscriptions', 'Create new subscription records manually'),
    ('subscriptions.cancel',   'Cancel Subscriptions',    'subscriptions', 'Cancel active subscriptions'),
    ('subscriptions.refund',   'Process Refunds',         'subscriptions', 'Process payment refunds via Paynow'),
    ('pricing.view',           'View Pricing Plans',      'subscriptions', 'View subscription plan pricing'),
    ('pricing.edit',           'Edit Pricing Plans',      'subscriptions', 'Modify subscription plan pricing'),

    -- Platform Admin (4 permissions)
    ('platform.projects.view', 'View Platform Projects',  'platform',      'View all projects across all organisations'),
    ('platform.projects.edit', 'Edit Platform Projects',  'platform',      'Edit project settings and status'),
    ('platform.settings.view', 'View Platform Settings',  'platform',      'View Platform-specific configuration'),
    ('platform.settings.edit', 'Edit Platform Settings',  'platform',      'Modify Platform-specific configuration'),

    -- Simulator Admin (8 permissions)
    ('simulator.scenarios.view',       'View Scenarios',          'simulator', 'View simulation scenario list'),
    ('simulator.scenarios.edit',       'Edit Scenarios',          'simulator', 'Edit existing simulation scenarios'),
    ('simulator.scenarios.create',     'Create Scenarios',        'simulator', 'Create new simulation scenarios'),
    ('simulator.scenarios.delete',     'Delete Scenarios',        'simulator', 'Archive or delete simulation scenarios'),
    ('simulator.learning_paths.view',  'View Learning Paths',     'simulator', 'View learning path configurations'),
    ('simulator.learning_paths.edit',  'Edit Learning Paths',     'simulator', 'Edit learning path content and structure'),
    ('simulator.certificates.view',    'View Certificates',       'simulator', 'View issued certificates'),
    ('simulator.certificates.edit',    'Edit Certificates',       'simulator', 'Edit certificate templates and criteria'),
    ('simulator.certificates.revoke',  'Revoke Certificates',     'simulator', 'Revoke issued certificates'),
    ('simulator.leaderboard.view',     'View Leaderboard',        'simulator', 'View leaderboard data'),
    ('simulator.leaderboard.reset',    'Reset Leaderboard',       'simulator', 'Reset leaderboard entries'),

    -- System (5 permissions)
    ('system.settings.view',       'View System Settings',    'system',  'View system-wide configuration'),
    ('system.settings.edit',       'Edit System Settings',    'system',  'Modify system-wide configuration'),
    ('system.maintenance.toggle',  'Toggle Maintenance Mode', 'system',  'Enable or disable maintenance mode'),
    ('system.feature_flags.view',  'View Feature Flags',      'system',  'View feature flag states'),
    ('system.feature_flags.edit',  'Edit Feature Flags',      'system',  'Toggle feature flags on/off'),
    ('system.deploy.view',         'View Deploy Status',      'system',  'View deployment status and history'),

    -- Support (3 permissions)
    ('support.tickets.view',       'View Support Tickets',    'support', 'View support ticket list and details'),
    ('support.tickets.manage',     'Manage Support Tickets',  'support', 'Update ticket status, priority, and assignment'),
    ('support.tickets.assign',     'Assign Support Tickets',  'support', 'Assign tickets to admin users'),
    ('support.announcements.create','Create Announcements',   'support', 'Create and publish system-wide announcements'),

    -- Error Monitoring (3 permissions)
    ('errors.dashboard.view',      'View Error Dashboard',    'errors',  'View error monitoring dashboard and error groups'),
    ('errors.status.manage',       'Manage Error Status',     'errors',  'Update error status (acknowledge, resolve, ignore)'),
    ('errors.alert_rules.edit',    'Edit Alert Rules',        'errors',  'Create and modify error auto-ticketing rules'),

    -- Audit (2 permissions)
    ('audit.logs.view',            'View Audit Logs',         'audit',   'View admin audit trail and activity logs'),
    ('audit.logs.export',          'Export Audit Logs',        'audit',   'Export audit logs to CSV, JSON, or PDF'),

    -- Security & Compliance (8 permissions)
    ('security.settings.view',     'View Security Settings',  'security',  'View security configuration (MFA, password policy, IP allowlist)'),
    ('security.settings.edit',     'Edit Security Settings',  'security',  'Modify security configuration'),
    ('security.sso.view',          'View SSO Config',         'security',  'View SSO provider configuration'),
    ('security.sso.edit',          'Edit SSO Config',         'security',  'Manage SSO providers (SAML, OAuth)'),
    ('security.incidents.view',    'View Security Incidents', 'security',  'View security alerts and incidents'),
    ('security.incidents.manage',  'Manage Security Incidents','security', 'Create, assign, and resolve security incidents'),
    ('security.gdpr.view',         'View GDPR Requests',      'security',  'View data export/deletion requests and consent logs'),
    ('security.gdpr.manage',       'Manage GDPR Requests',    'security',  'Process data export/deletion requests and breach records'),

    -- Content Management (6 permissions)
    ('content.docs.view',          'View Documentation CMS',  'content',   'View documentation articles'),
    ('content.docs.edit',          'Edit Documentation CMS',  'content',   'Create and edit documentation articles'),
    ('content.help.view',          'View Help Articles',      'content',   'View help articles and guided tours'),
    ('content.help.edit',          'Edit Help Articles',      'content',   'Create and edit help articles and tours'),
    ('content.pwa.view',           'View PWA Settings',       'content',   'View PWA configuration'),
    ('content.pwa.edit',           'Edit PWA Settings',       'content',   'Modify PWA icons, manifest, install prompt'),
    ('content.menus.view',         'View Menu Config',        'content',   'View system-wide role-menu configuration'),
    ('content.menus.edit',         'Edit Menu Config',        'content',   'Modify which menu items each role can see'),

    -- Feedback & Backlog (5 permissions)
    ('feedback.bugs.view',         'View Bug Reports',        'feedback',  'View bug reports submitted by users'),
    ('feedback.bugs.manage',       'Manage Bug Reports',      'feedback',  'Update status, assign, and resolve bug reports'),
    ('feedback.requests.view',     'View Feature Requests',   'feedback',  'View feature requests from users'),
    ('feedback.requests.manage',   'Manage Feature Requests', 'feedback',  'Approve, reject, and prioritise feature requests'),
    ('feedback.analysis.view',     'View Feedback Analysis',  'feedback',  'View user feedback trends and analytics'),
    ('feedback.backlog.view',      'View Improvement Backlog','feedback',  'View system improvement backlog'),
    ('feedback.backlog.manage',    'Manage Improvement Backlog','feedback','Create, prioritise, and track improvement items'),

    -- Admin Management (9 permissions — Super Admin only)
    ('admins.view',                'View Admin Users',        'admin_mgmt', 'View list of admin users'),
    ('admins.create',              'Create Admin Users',      'admin_mgmt', 'Create admin user records'),
    ('admins.invite',              'Invite Admin Users',      'admin_mgmt', 'Send admin invitation emails'),
    ('admins.activate',            'Activate Admin Users',    'admin_mgmt', 'Activate pending admin registrations'),
    ('admins.reject',              'Reject Admin Users',      'admin_mgmt', 'Reject pending admin registrations'),
    ('admins.suspend',             'Suspend Admin Users',     'admin_mgmt', 'Suspend active admin accounts'),
    ('admins.reactivate',          'Reactivate Admin Users',  'admin_mgmt', 'Reactivate suspended admin accounts'),
    ('admins.deactivate',          'Deactivate Admin Users',  'admin_mgmt', 'Permanently deactivate admin accounts'),
    ('admins.roles.assign',        'Assign Admin Roles',      'admin_mgmt', 'Change admin user role assignments')
  ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;
  ```

- [x] **1.12** SQL: Seed complete role-permission mappings:
  ```sql
  -- SUPER ADMIN — gets ALL permissions
  INSERT INTO admin.role_permissions (role, permission_key)
  SELECT 'super_admin', permission_key FROM admin.admin_permissions
  ON CONFLICT (role, permission_key) DO NOTHING;

  -- SYSTEM ADMIN — gets everything EXCEPT admin management and deploy
  INSERT INTO admin.role_permissions (role, permission_key)
  SELECT 'system_admin', permission_key FROM admin.admin_permissions
  WHERE category != 'admin_mgmt'
    AND permission_key != 'system.deploy.view'
  ON CONFLICT (role, permission_key) DO NOTHING;

  -- SUPPORT ADMIN — user support operations + read-only system view
  INSERT INTO admin.role_permissions (role, permission_key)
  VALUES
    ('support_admin', 'users.view'),
    ('support_admin', 'users.password_reset'),
    ('support_admin', 'users.impersonate'),
    ('support_admin', 'orgs.view'),
    ('support_admin', 'subscriptions.view'),
    ('support_admin', 'subscriptions.edit'),
    ('support_admin', 'platform.projects.view'),
    ('support_admin', 'platform.settings.view'),
    ('support_admin', 'simulator.scenarios.view'),
    ('support_admin', 'simulator.learning_paths.view'),
    ('support_admin', 'simulator.certificates.view'),
    ('support_admin', 'simulator.leaderboard.view'),
    ('support_admin', 'system.settings.view'),
    ('support_admin', 'system.feature_flags.view'),
    ('support_admin', 'support.tickets.view'),
    ('support_admin', 'support.tickets.manage'),
    ('support_admin', 'support.tickets.assign'),
    ('support_admin', 'support.announcements.create'),
    ('support_admin', 'errors.dashboard.view'),
    ('support_admin', 'errors.status.manage'),
    ('support_admin', 'audit.logs.view'),
    ('support_admin', 'security.incidents.view'),
    ('support_admin', 'feedback.bugs.view'),
    ('support_admin', 'feedback.bugs.manage'),
    ('support_admin', 'feedback.requests.view'),
    ('support_admin', 'feedback.requests.manage'),
    ('support_admin', 'feedback.analysis.view')
  ON CONFLICT (role, permission_key) DO NOTHING;

  -- CONTENT ADMIN — simulator content + documentation + help articles
  INSERT INTO admin.role_permissions (role, permission_key)
  VALUES
    ('content_admin', 'simulator.scenarios.view'),
    ('content_admin', 'simulator.scenarios.edit'),
    ('content_admin', 'simulator.scenarios.create'),
    ('content_admin', 'simulator.scenarios.delete'),
    ('content_admin', 'simulator.learning_paths.view'),
    ('content_admin', 'simulator.learning_paths.edit'),
    ('content_admin', 'simulator.certificates.view'),
    ('content_admin', 'simulator.certificates.edit'),
    ('content_admin', 'simulator.certificates.revoke'),
    ('content_admin', 'simulator.leaderboard.view'),
    ('content_admin', 'simulator.leaderboard.reset'),
    ('content_admin', 'content.docs.view'),
    ('content_admin', 'content.docs.edit'),
    ('content_admin', 'content.help.view'),
    ('content_admin', 'content.help.edit')
  ON CONFLICT (role, permission_key) DO NOTHING;
  ```

- [x] **1.13** SQL: Create Super Admin seed script (`npm run admin:seed-super`):
  ```sql
  -- This runs ONCE during initial deployment via CLI script
  -- Creates the first Super Admin account directly in the DB
  -- Subsequent admins are created via the invite flow

  -- Step 1: Create Supabase Auth user (handled by CLI script via Supabase Admin API)
  -- Step 2: Insert admin record
  INSERT INTO admin.admin_users (
    auth_user_id,          -- from Step 1
    email,                 -- provided via CLI prompt
    full_name,             -- provided via CLI prompt
    role,
    activation_status,
    activated_at,
    is_2fa_configured      -- 2FA enforced on first login
  ) VALUES (
    :auth_user_id,
    :email,
    :full_name,
    'super_admin',
    'active',              -- Super Admin is active immediately (no checkpoint needed)
    NOW(),
    false                  -- must configure 2FA on first login
  );
  ```

- [x] **1.13.1** Create CLI seed script `scripts/seed-super-admin.js`:
  - Interactive CLI prompt: asks for email and full name
  - Creates Supabase Auth user via Admin API (`supabase.auth.admin.createUser()`)
  - Inserts record into `admin.admin_users` with `role = 'super_admin'`, `activation_status = 'active'`
  - Outputs: "Super Admin created. Log in at [admin URL] to set up 2FA."
  - **Can only be run once** — if a `super_admin` record already exists, script exits with: "Super Admin already exists. Use the admin panel to create additional admins."
  - Registered in admin `package.json` as: `"admin:seed-super": "node scripts/seed-super-admin.js"`

- [x] **1.14** SQL: Seed default system settings:
  ```sql
  INSERT INTO admin.system_settings (setting_key, setting_value, setting_type, category, description)
  VALUES
    -- Session settings
    ('session.timeout_minutes',       '30',     'integer', 'security',     'Admin session timeout in minutes of inactivity'),
    ('session.max_concurrent',        '2',      'integer', 'security',     'Maximum concurrent admin sessions per user'),
    ('session.heartbeat_interval',    '5',      'integer', 'security',     'Session heartbeat interval in minutes'),

    -- Login security
    ('login.max_failed_attempts',     '5',      'integer', 'security',     'Failed login attempts before account lockout'),
    ('login.lockout_minutes',         '30',     'integer', 'security',     'Account lockout duration in minutes'),
    ('login.rate_limit_attempts',     '3',      'integer', 'security',     'Max login attempts per IP per rate window'),
    ('login.rate_limit_window',       '15',     'integer', 'security',     'Rate limit window in minutes'),
    ('login.captcha_after_attempts',  '2',      'integer', 'security',     'Show CAPTCHA after this many failed attempts'),
    ('login.require_2fa',             'true',   'boolean', 'security',     'Require 2FA for all admin logins'),

    -- Invitation settings
    ('invite.expiry_hours',           '48',     'integer', 'invitations',  'Invitation link expiry in hours'),
    ('invite.max_expiry_hours',       '72',     'integer', 'invitations',  'Maximum allowed invitation expiry in hours'),

    -- Password policy
    ('password.min_length',           '12',     'integer', 'security',     'Minimum password length'),
    ('password.require_uppercase',    'true',   'boolean', 'security',     'Require uppercase characters in password'),
    ('password.require_lowercase',    'true',   'boolean', 'security',     'Require lowercase characters in password'),
    ('password.require_number',       'true',   'boolean', 'security',     'Require numeric characters in password'),
    ('password.require_special',      'true',   'boolean', 'security',     'Require special characters in password'),
    ('password.history_count',        '5',      'integer', 'security',     'Number of previous passwords to prevent reuse'),

    -- Time-based access
    ('access.business_hours_start',   '06:00',  'time',    'security',     'Admin access allowed from (local time)'),
    ('access.business_hours_end',     '22:00',  'time',    'security',     'Admin access allowed until (local time)'),
    ('access.enforce_business_hours', 'false',  'boolean', 'security',     'Enforce business hours restriction on logins'),

    -- Error monitoring
    ('errors.retention_days',         '90',     'integer', 'monitoring',   'Days to retain raw error log entries before archiving'),
    ('errors.auto_ticket_user_threshold',   '3',  'integer', 'monitoring', 'Unique users hitting same error to trigger auto-ticket'),
    ('errors.auto_ticket_count_threshold', '10',  'integer', 'monitoring', 'Error occurrences to trigger auto-ticket'),
    ('errors.auto_ticket_window_minutes',  '60',  'integer', 'monitoring', 'Time window for auto-ticket thresholds'),
    ('errors.escalation_hours',       '4',      'integer', 'monitoring',   'Hours before unresolved auto-ticket escalates to System Admin'),
    ('errors.daily_digest_enabled',   'true',   'boolean', 'monitoring',   'Send daily error digest email to Support Admin'),

    -- Maintenance
    ('maintenance.platform_enabled',  'false',  'boolean', 'system',       'Platform maintenance mode active'),
    ('maintenance.simulator_enabled', 'false',  'boolean', 'system',       'Simulator maintenance mode active'),
    ('maintenance.message',           '',       'text',    'system',       'Maintenance mode message displayed to users'),

    -- Notifications
    ('notifications.login_alert_email',   'true',  'boolean', 'notifications', 'Email Super Admin on every admin login'),
    ('notifications.login_alert_sms',     'false', 'boolean', 'notifications', 'SMS Super Admin on every admin login'),
    ('notifications.new_registration',    'true',  'boolean', 'notifications', 'Notify Super Admin of new admin registrations pending activation')
  ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description;
  ```

- [x] **1.15** SQL: Seed default error alert rules:
  ```sql
  INSERT INTO admin.error_alert_rules (rule_name, error_type, threshold_users, threshold_occurrences, time_window_minutes, auto_ticket_priority, notify_role)
  VALUES
    ('Critical — RLS/permission errors',       'rls_error',    1,  1,  60, 'critical', 'system_admin'),
    ('Critical — Payment page errors',          null,          1,  1,  60, 'critical', 'system_admin'),
    ('High — Multiple users same error',        null,          3,  10, 60, 'high',     'support_admin'),
    ('Medium — Recurring resolved errors',      null,          1,  3,  60, 'high',     'support_admin'),
    ('Low — Slow page loads',                   'slow_load',   5,  20, 60, 'medium',   'support_admin');

  -- Note: Payment page rule uses page_route_pattern = '*/checkout*|*/payment*|*/subscription*'
  UPDATE admin.error_alert_rules
  SET page_route_pattern = '*/checkout*|*/payment*|*/subscription*'
  WHERE rule_name = 'Critical — Payment page errors';
  ```

- [x] **1.16** SQL: Enable RLS on all `admin` schema tables
- [x] **1.17** SQL: Create RLS policies — only authenticated admin users can access admin schema
- [x] **1.18** Register all new tables in `database_tables` registry
- [x] **1.19** SQL: Consolidate `system_settings` (v02) and `admin_system_settings` (v80) — migrate to `admin.system_settings` with backward-compatible view

**SQL file:** `SQL/v735_01_admin_schema.sql`
**SQL file:** `SQL/v735_01b_admin_seed_data.sql`

---

### Phase 2: Admin Authentication & Security
**Goal:** Hardened auth flow with invitation-only registration, two-checkpoint activation, mandatory 2FA, and session management.

#### 2A — Invitation & Registration (Checkpoint 1)

- [x] **2A.1** Create invite management service (`services/invitationService.js`):
  - `createInvitation(email, role, customMessage)` — generates 64-char token, stores in `admin.admin_invitations`, sends email
  - `validateToken(token)` — checks exists, not expired, not used, not revoked
  - `revokeInvitation(invitationId, reason)` — Super Admin cancels a pending invite
  - `getActiveInvitations()` — list all pending/unexpired invites
  - `cleanupExpiredInvitations()` — mark expired tokens (scheduled task)

- [x] **2A.2** Create account setup page (`pages/auth/AccountSetup.jsx`) — served at `/setup/{token}`:
  - Validates token on mount (invalid/expired → generic error, no detail leak)
  - Shows: pre-filled email (read-only), full name, password (with strength meter), confirm password
  - Password requirements: min 12 chars, uppercase + lowercase + number + special char
  - No indication this is an admin page — plain dark page, no branding

- [x] **2A.3** Create 2FA setup page (`pages/auth/TwoFactorSetup.jsx`) — mandatory step after password:
  - QR code for authenticator app (Google Authenticator, Authy, Microsoft Authenticator)
  - Manual entry key (for users who can't scan)
  - Verify 2FA works (enter a code to confirm setup)
  - Generate 10 backup recovery codes (one-time use)
  - User must check "I have saved my recovery codes" before proceeding
  - On completion: creates `admin.admin_users` record with `activation_status = 'pending_activation'`

- [x] **2A.4** Create pending activation page (`pages/auth/PendingActivation.jsx`):
  - Shown after successful registration
  - Message: "Your account has been created. It is now pending activation by the Super Admin. You will receive an email once your account is activated."
  - No login form, no retry button — just the message
  - If user tries to visit login page while pending: redirect here

- [x] **2A.5** Create notification to Super Admin:
  - When a new admin completes registration, Super Admin receives:
    - In-app notification (badge on "Pending Activations" menu item)
    - Email: "New admin registration pending your activation — {name} ({email}) as {role}"
  - Notification includes link to Pending Activations page in admin panel

#### 2B — Super Admin Activation (Checkpoint 2)

- [x] **2B.1** Create `PendingActivationsPage.jsx` (`pages/admin-management/PendingActivations.jsx`):
  - List of all admins with `activation_status = 'pending_activation'`
  - Columns: name, email, role, registered date, registration IP, 2FA configured
  - For each pending admin, two actions:
    - **Activate** → confirmation modal: "Activate {name} as {role}? They will be able to log in immediately."
    - **Reject** → modal with mandatory reason field: "Why are you rejecting this registration?"
  - Badge count shown on sidebar menu item

- [x] **2B.2** Create activation service (`services/activationService.js`):
  - `getPendingActivations()` — query `admin.admin_users WHERE activation_status = 'pending_activation'`
  - `activateAdmin(adminUserId)` — sets `activation_status = 'active'`, `activated_by`, `activated_at`; sends activation email to admin; logs to audit
  - `rejectAdmin(adminUserId, reason)` — sets `activation_status = 'rejected'`, `rejection_reason`; sends rejection email; logs to audit
  - `suspendAdmin(adminUserId, reason)` — sets `activation_status = 'suspended'`, `suspended_reason`; terminates active sessions; logs to audit
  - `reactivateAdmin(adminUserId)` — changes `suspended` back to `active`; logs to audit
  - `deactivateAdmin(adminUserId)` — permanent deactivation, cannot be reversed; logs to audit

- [x] **2B.3** Activation email to new admin:
  - "Your admin account has been activated by {super_admin_name}. You can now log in."
  - Does NOT include the admin URL — the admin must already know it from the original invite email
  - Includes: their role, who activated them, activation timestamp

- [x] **2B.4** Rejection email to rejected admin:
  - "Your admin registration has not been approved. If you believe this is an error, contact the Super Admin."
  - Does NOT include the rejection reason (internal only)

#### 2C — Login Flow (Only for Activated Admins)

- [x] **2C.1** Create `AdminAuthContext.jsx` — admin-specific auth provider:
  - On login attempt: first checks `admin.admin_users` for matching email
  - Checks `activation_status`:
    - `'active'` → proceed with auth
    - `'pending_activation'` → show "Your account is not yet activated. Contact the Super Admin."
    - `'rejected'` → show "Your account access has been denied."
    - `'suspended'` → show "Your account has been suspended. Contact the Super Admin."
    - `'deactivated'` → show "Your account access has been denied."
    - Not found → generic "Invalid credentials" (no hint that the account doesn't exist)
  - Enforces 2FA on every login (no "remember device" bypass)
  - Session timeout after 30 minutes of inactivity (configurable)
  - Tracks login IP and user agent
  - Locks account after 5 failed attempts (30-minute lockout)

- [x] **2C.2** Create admin login page (`pages/auth/AdminLogin.jsx`):
  - Email + password form (no social auth, no "Sign Up" link, no "Forgot Password" link on first view)
  - After email+password validated: 2FA code entry step
  - Rate limiting: 3 attempts per IP per 15 minutes
  - CAPTCHA after 2 failed attempts
  - Dark theme, zero branding, no system name
  - Failed attempt counter visible to the user ("Attempt 2 of 5")

- [x] **2C.3** Create `useAdminAuth.js` hook:
  - `isAuthenticated`, `adminUser`, `role`, `permissions`, `activationStatus`
  - `hasPermission(permissionKey)` — checks role_permissions
  - `logout()` — ends session, logs audit event
  - Auto-redirect to login on session expiry

- [x] **2C.4** Create `RoleGuard.jsx` component — wraps routes requiring specific roles:
  ```jsx
  <RoleGuard roles={['super_admin', 'system_admin']}>
    <SystemSettingsPage />
  </RoleGuard>
  ```

- [x] **2C.5** Create `PermissionGuard.jsx` component — wraps actions requiring specific permissions:
  ```jsx
  <PermissionGuard permission="users.password_reset">
    <ResetPasswordButton />
  </PermissionGuard>
  ```

- [x] **2C.6** Create `useAuditLog.js` hook — automatically logs admin actions:
  - Wraps service calls to capture before/after state
  - Logs to `admin.admin_audit_log` with admin user, IP, action, target, changes
  - Cannot be disabled or bypassed

- [x] **2C.7** Create session management service:
  - Concurrent session limit (max 2 active sessions per admin)
  - Force-logout capability (Super Admin can terminate any session)
  - Session activity heartbeat (every 5 minutes)
  - On admin suspension/deactivation: immediately terminate all active sessions

- [x] **2C.8** SQL: Create DB functions:
  - `admin.check_admin_permission(admin_user_id, permission_key)` — returns boolean
  - `admin.validate_admin_login(email)` — returns activation_status + role (used before auth)
  - `admin.record_login_attempt(email, ip, success)` — tracks attempts, handles lockout

- [x] **2C.9** Unit tests for:
  - Full invite → setup → pending → activate → login flow
  - Rejected admin cannot log in
  - Suspended admin sessions terminated immediately
  - Rate limiting and account lockout
  - Permission checks per role
  - Token expiry and single-use enforcement

**SQL file:** `SQL/v735_02_admin_auth_functions.sql`

---

### Phase 3: Admin Layout & Navigation
**Goal:** Admin shell with role-aware sidebar, header, and dashboard.

- [x] **3.1** Create `AdminLayout.jsx` — main layout with sidebar + header + content area:
  - Collapsible sidebar (default expanded on desktop, collapsed on mobile)
  - Header with: admin name, role badge, session timer, quick search, notifications, logout
  - Breadcrumb trail
  - Dark theme default

- [x] **3.2** Create `AdminSidebar.jsx` — role-filtered navigation:
  ```
  Dashboard
  ─────────────────
  Users & Organisations
    ├── Users                    [system_admin+]
    ├── Organisations            [system_admin+]
    └── User Activity            [system_admin+]
  ─────────────────
  Subscriptions & Billing
    ├── Subscriptions            [system_admin+]
    ├── Pricing Plans            [system_admin+]
    ├── Payment Transactions     [system_admin+]
    └── Revenue Dashboard        [super_admin]
  ─────────────────
  Platform Admin
    ├── Projects Overview        [system_admin+]
    ├── Platform Settings        [system_admin+]
    └── Platform Health          [system_admin+]
  ─────────────────
  Platform Mirror ◈              [support_admin+]
    ├── (Mirrors the Platform sidebar menu structure)
    ├── (Dynamically loaded from Platform menu config)
    ├── (Read-only admin-enhanced views with debug overlay)
    └── (Role selector: view as any Platform user role)
  ─────────────────
  Simulator Admin
    ├── Scenarios                [content_admin+]
    ├── Learning Paths           [content_admin+]
    ├── Certificates             [content_admin+]
    ├── Leaderboard              [content_admin+]
    ├── NPC Templates            [content_admin+]
    └── Simulator Health         [system_admin+]
  ─────────────────
  Simulator Mirror ◈             [support_admin+]
    ├── (Mirrors the Simulator sidebar menu structure)
    ├── (Dynamically loaded from Simulator menu config)
    ├── (Read-only admin-enhanced views with debug overlay)
    └── (Role selector: view as any Simulator user role)
  ─────────────────
  Support
    ├── Support Tickets          [support_admin+]
    ├── Announcements            [support_admin+]
    └── User Impersonation       [support_admin+]
  ─────────────────
  Error Monitoring
    ├── Error Dashboard          [support_admin+]
    ├── Error Groups             [support_admin+]
    ├── Alert Rules              [system_admin+]
    └── Error Log Archive        [system_admin+]
  ─────────────────
  Security & Compliance
    ├── Security Settings        [system_admin+]
    ├── Authentication Config    [system_admin+]
    ├── SSO Management           [system_admin+]
    ├── Security Monitoring      [system_admin+]
    ├── Security Incidents       [system_admin+]
    ├── GDPR / Data Compliance   [system_admin+]
    └── Performance Metrics      [system_admin+]
  ─────────────────
  Content Management
    ├── Documentation CMS        [content_admin+]
    ├── Help Articles & Tours    [content_admin+]
    ├── PWA Configuration        [system_admin+]
    └── Role Menu Configuration  [system_admin+]
  ─────────────────
  Feedback & Backlog
    ├── Bug Reports              [support_admin+]
    ├── Feature Requests         [support_admin+]
    ├── Feedback Analysis        [support_admin+]
    └── Improvement Backlog      [system_admin+]
  ─────────────────
  System
    ├── System Settings          [system_admin+]
    ├── Feature Flags            [system_admin+]
    ├── Maintenance Mode         [super_admin]
    └── System Health            [system_admin+]
  ─────────────────
  Audit & Logs
    ├── Audit Trail              [system_admin+]
    ├── Admin Activity           [system_admin+]
    └── Export Logs              [system_admin+]
  ─────────────────
  Admin Management               [super_admin only]
    ├── Admin Users
    ├── Role Permissions
    └── Active Sessions
  ```

- [x] **3.3** Create `AdminDashboard.jsx` — role-specific dashboard with widgets:
  - **Super Admin:** System health, active users, revenue summary, admin activity, alerts
  - **System Admin:** Active users, subscription stats, system health, recent support tickets
  - **Support Admin:** Open tickets, recent user issues, impersonation log, announcements
  - **Content Admin:** Scenario stats, learning path completion rates, certificate issuance, leaderboard activity

- [x] **3.4** Create admin routes file (`routes/adminRoutes.jsx`) with lazy imports and role guards
- [x] **3.5** Create reusable admin UI components:
  - `AdminTable.jsx` — sortable, filterable, paginated table with export
  - `AdminCard.jsx` — stat/KPI card with trend indicator
  - `AdminModal.jsx` — confirmation/action modal
  - `AdminForm.jsx` — form wrapper with validation
  - `AdminBadge.jsx` — role/status badges
  - `AuditTrailWidget.jsx` — inline audit history for any record

- [x] **3.6** Unit tests for layout, sidebar filtering, dashboard widgets

---

### Phase 4: User & Organisation Management
**Goal:** Full CRUD for users and organisations across both Platform and Simulator.

- [x] **4.1** Create `UserListPage.jsx` — paginated list of all users:
  - Search by name, email, org
  - Filter by: status (active/suspended/locked), role, subscription tier, last login date range
  - Columns: name, email, org, role, subscription, last login, status, actions
  - Card/table toggle (rule 41), sortable headers (rule 40), row numbers (rule 44)
  - Export to Excel/CSV/JSON (rule 38)

- [x] **4.2** Create `UserDetailPage.jsx` — comprehensive user view:
  - Profile info (editable by system_admin+)
  - Organisation membership
  - Subscription status and history
  - Login history (last 30 logins with IP, device, timestamp)
  - Platform activity summary (projects count, last active)
  - Simulator activity summary (runs, scores, certificates)
  - Action buttons: Reset Password, Suspend/Activate, Adjust Subscription, Impersonate
  - Inline audit trail for this user

- [x] **4.3** Create `OrgListPage.jsx` — paginated list of all organisations:
  - Search by name, domain, owner
  - Filter by: verification status, subscription tier, member count, created date range
  - Columns: name, owner, members, subscription, verified, projects count, created date
  - Card/table toggle, sortable headers, row numbers, export

- [x] **4.4** Create `OrgDetailPage.jsx` — comprehensive org view:
  - Org info (editable by system_admin+)
  - Member list with roles
  - Verification status (with manual verify/revoke action)
  - Subscription and billing history
  - Projects list
  - Action buttons: Verify, Suspend, Adjust Subscription
  - Inline audit trail for this org

- [x] **4.5** Create `UserActivityPage.jsx` — global user activity feed:
  - Real-time feed of user logins, signups, subscription changes
  - Filter by activity type, date range
  - Daily/weekly/monthly active user charts

- [x] **4.6** Create user management service (`services/userService.js`):
  - `getUsers(filters, pagination)` — reads from `public.profiles`
  - `getUserDetail(userId)` — profile + org + subscription + activity
  - `resetPassword(userId)` — triggers Supabase password reset email
  - `suspendUser(userId, reason)` — sets `is_active = false`, logs reason
  - `activateUser(userId)` — sets `is_active = true`
  - All operations auto-logged via `useAuditLog`

- [x] **4.7** Create org management service (`services/orgService.js`):
  - `getOrganisations(filters, pagination)` — reads from `public.organisations`
  - `getOrgDetail(orgId)` — org + members + subscription + projects
  - `verifyOrg(orgId)` — manual verification
  - `suspendOrg(orgId, reason)` — suspends org and all member access
  - All operations auto-logged

- [x] **4.8** Unit tests for user and org CRUD operations

---

### Phase 5: Subscription & Billing Management
**Goal:** Admin control over subscription plans, pricing, individual subscriptions, and payment oversight.

- [x] **5.1** Create `SubscriptionListPage.jsx` — all active subscriptions:
  - Filter by: plan tier, status (active/trial/expired/cancelled), payment method, date range
  - Columns: user/org, plan, status, start date, renewal date, amount, payment status
  - Card/table toggle, sortable headers, row numbers, export

- [x] **5.2** Create `SubscriptionDetailPage.jsx` — individual subscription management:
  - Current plan details
  - Payment history
  - Action buttons: Upgrade/Downgrade, Extend Trial, Cancel, Refund, Apply Discount
  - Inline audit trail

- [x] **5.3** Create `PricingPlansPage.jsx` — manage subscription plan pricing:
  - List all plans (Platform + Simulator) with current pricing
  - Edit pricing (effective date for changes — not retroactive)
  - Toggle plan availability (enable/disable plans)
  - Preview pricing change impact (how many active subscribers affected)
  - **Super Admin + System Admin only**

- [x] **5.4** Create `PaymentTransactionsPage.jsx` — payment audit trail:
  - All Paynow transactions
  - Filter by: status (success/failed/pending), amount range, date range, user
  - Retry failed payments
  - Manual payment recording (for offline/bank transfer payments)

- [x] **5.5** Create `RevenueDashboardPage.jsx` — financial overview (**Super Admin only**):
  - Monthly recurring revenue (MRR)
  - Subscriber growth chart
  - Churn rate
  - Revenue by plan tier
  - Revenue by system (Platform vs Simulator)
  - Trial-to-paid conversion rate

- [x] **5.6** Create subscription management service (`services/subscriptionService.js`)
- [x] **5.7** Unit tests for subscription operations

**SQL file:** `SQL/v735_03_admin_subscription_functions.sql`

---

### Phase 6: System Management
**Goal:** System configuration, feature flags, maintenance mode, and health monitoring.

- [x] **6.1** Create `SystemSettingsPage.jsx` — key system settings:
  - Email settings (SMTP config, email templates toggle)
  - Session settings (timeout duration, max concurrent sessions)
  - Registration settings (open/closed, email domain restrictions)
  - Trial settings (duration, member limit, feature restrictions)
  - File upload settings (max size, allowed types)
  - All changes logged to audit trail with before/after values

- [x] **6.2** Create `FeatureFlagsPage.jsx` — toggle features on/off:
  - List all feature flags with current state (on/off)
  - Toggle with confirmation modal
  - Percentage rollout support (e.g., "enable for 20% of users")
  - Per-system flags (Platform only, Simulator only, both)
  - Flag history (who changed what, when)

- [x] **6.3** Create `MaintenanceModePage.jsx` — take systems offline (**Super Admin only**):
  - Toggle maintenance mode for: Platform, Simulator, or both
  - Set maintenance message (displayed to users)
  - Set estimated duration
  - Schedule maintenance window (start/end time)
  - Active admin sessions are NOT affected (admins can still access admin panel)

- [x] **6.4** Create `SystemHealthPage.jsx` — monitoring dashboard:
  - Supabase connection status
  - API response times (last 24h)
  - Error rate chart
  - Active user count (real-time)
  - Database size and table row counts
  - Background job status (cron jobs, trial expiry checks)

- [x] **6.5** SQL: Create `admin.feature_flags` table:
  ```sql
  admin.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key VARCHAR(100) UNIQUE NOT NULL,
    flag_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
    applies_to VARCHAR(20) CHECK (applies_to IN ('platform', 'simulator', 'both', 'admin')),
    updated_by UUID REFERENCES admin.admin_users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  ```

- [x] **6.6** SQL: Create `admin.maintenance_windows` table:
  ```sql
  admin.maintenance_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_system VARCHAR(20) CHECK (target_system IN ('platform', 'simulator', 'both')),
    status VARCHAR(20) CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
    message TEXT NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  ```

- [x] **6.7** Create system management service (`services/systemService.js`)
- [x] **6.8** Unit tests for system settings, feature flags, maintenance mode

**SQL file:** `SQL/v735_04_admin_system_tables.sql`

---

### Phase 7: Support & User Assistance
**Goal:** Tools for support staff to help users resolve issues without direct DB access.

- [x] **7.1** Create `SupportTicketListPage.jsx` — all support tickets:
  - Filter by: status (open/in-progress/resolved/closed), priority, category, assigned admin, date range
  - Columns: ticket #, subject, user, category, priority, status, assigned to, created date
  - Card/table toggle, sortable headers, row numbers, export

- [x] **7.2** Create `SupportTicketDetailPage.jsx` — individual ticket:
  - Ticket info and conversation thread
  - User context panel (who submitted, their subscription, recent activity)
  - Internal notes (visible to admins only)
  - Action buttons: Assign, Change Priority, Change Status, Link to User Account
  - Quick actions: Reset User Password, Extend Trial, Adjust Subscription (inline, without navigating away)

- [x] **7.3** Create `UserImpersonationPage.jsx` — debug user issues (**Support Admin+**):
  - **Two impersonation modes:**

  **Mode A — Impersonate a Specific User:**
  - Search for user by name, email, or org
  - Shows user's current role, org, subscription, last login, recent activity
  - Requires confirmation with mandatory reason (logged to audit)
  - Opens main app in a separate tab as that exact user — sees their projects, their data, their permissions
  - Impersonation banner: "Viewing as: user@email.com (Project Manager) — Admin: admin@nidus.com"
  - Session limited to 30 minutes
  - All actions during impersonation logged to audit trail
  - Cannot impersonate other admins
  - Cannot perform destructive actions (delete, payment) while impersonating

  **Mode B — Impersonate a Role (no specific user):**
  - Select a system and role to simulate what that role sees:

    **Platform roles available for impersonation:**
    - PMO Admin
    - Portfolio Manager
    - Programme Manager
    - Project Manager
    - Project Sponsor
    - Project Board Member
    - Project Assurance
    - Quality Assurance
    - Change Authority
    - Team Lead / Team Manager
    - Team Member
    - Stakeholder
    - Viewer

    **Simulator roles available for impersonation:**
    - Project Manager
    - Programme Manager
    - Portfolio Manager
    - PMO Analyst
    - Project Coordinator

  - Opens main app with a test/demo account for that role — sees the sidebar, pages, and permissions that role would see
  - Useful for: verifying role-based access is working correctly, testing new features per role, training new support staff
  - Impersonation banner: "Role Preview: Team Member (Platform) — Admin: admin@nidus.com"
  - No real user data is accessed — uses a sandboxed demo context
  - Session limited to 60 minutes (longer than user impersonation since it's non-destructive)

- [x] **7.4** Create `AnnouncementsPage.jsx` — system-wide announcements:
  - Create/edit/delete announcements
  - Target: all users, Platform users, Simulator users, specific subscription tiers
  - Schedule: immediate, scheduled date, expiry date
  - Type: info, warning, maintenance, feature update
  - Preview before publishing

- [x] **7.5** SQL: Create `admin.support_tickets` table:
  ```sql
  admin.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number SERIAL UNIQUE,
    user_id UUID REFERENCES auth.users(id),
    subject VARCHAR(255) NOT NULL,
    category VARCHAR(50) CHECK (category IN ('account', 'billing', 'technical', 'feature_request', 'bug_report', 'general')),
    priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(20) CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
    assigned_to UUID REFERENCES admin.admin_users(id),
    resolved_by UUID REFERENCES admin.admin_users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
  ```

- [x] **7.6** SQL: Create `admin.ticket_messages` table (conversation thread)
- [x] **7.7** SQL: Create `admin.announcements` table
- [x] **7.8** SQL: Create `admin.impersonation_log` table (immutable, append-only)
- [x] **7.9** Create support service (`services/supportService.js`)
- [x] **7.10** Unit tests for support operations

**SQL file:** `SQL/v735_05_admin_support_tables.sql`

#### 7B — Proactive Error Monitoring & Auto-Ticketing

**Goal:** Automatically capture errors users encounter across Platform and Simulator, log them centrally, deduplicate, auto-create support tickets, and alert the Support Admin — all before the user even reports the issue.

##### 7B.1 — Frontend Error Capture (installed in Platform + Simulator apps)

- [x] **7B.1.1** Create `src/services/errorReportingService.js` — lightweight error reporter installed in both Platform and Simulator main apps (NOT in the admin app):
  - **Captures:**
    - Unhandled JavaScript errors (via `window.onerror` and `window.onunhandledrejection`)
    - React error boundary catches (component-level crashes)
    - Failed API/Supabase calls (HTTP 4xx/5xx responses)
    - Slow page loads (> 5 seconds threshold, configurable)
    - Failed navigation (route not found, lazy load failures)
    - RLS permission errors (PostgREST 403/42501 responses)
  - **Collects per error event:**
    - `user_id`, `user_role`, `user_email`
    - `system` (platform / simulator)
    - `page_route` (current URL path)
    - `component_name` (React component that threw, if available)
    - `error_type` (js_error, api_error, slow_load, rls_error, route_error)
    - `error_message` and `stack_trace` (sanitised — no passwords, tokens, or PII in stack)
    - `browser`, `os`, `device_type` (desktop/mobile/tablet)
    - `timestamp`
    - `session_id` (to correlate multiple errors from same session)
  - **Privacy safeguards:**
    - Strip auth tokens, passwords, and email content from error payloads
    - Do not capture user input field values
    - Respect any "Do Not Track" browser setting

- [x] **7B.1.2** Create `ErrorBoundaryReporter.jsx` — enhanced React error boundary wrapper:
  - Catches component render errors
  - Shows user-friendly fallback UI: "Something went wrong. Our team has been notified."
  - Includes "Report additional details" button for users to add context (optional)
  - Automatically sends error report to `admin.system_error_log` via Supabase insert
  - Does NOT crash the entire app — only the affected component/page

- [x] **7B.1.3** Create API error interceptor — middleware for Supabase client:
  - Intercepts failed Supabase queries (`.from().select()` returning errors)
  - Logs error with: table name, operation (select/insert/update/delete), error code, error message
  - Does not block the original error handling — just reports silently in background
  - Rate-limited: max 10 reports per user per minute (prevent flood from error loops)

- [x] **7B.1.4** Install error reporting in both Platform and Simulator apps:
  - Wrap root `<App>` component in `<ErrorBoundaryReporter>`
  - Initialise `errorReportingService` in `main.jsx`
  - Add API interceptor to `supabaseClient.js` (both `platformDb` and `simDb`)

##### 7B.2 — Error Log Database

- [x] **7B.2.1** SQL: Create `admin.system_error_log` table:
  ```sql
  admin.system_error_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_hash VARCHAR(64) NOT NULL,            -- SHA-256 of error_type + error_message + page_route (for deduplication)
    user_id UUID REFERENCES auth.users(id),
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    system VARCHAR(20) NOT NULL CHECK (system IN ('platform', 'simulator')),
    page_route VARCHAR(500),
    component_name VARCHAR(255),
    error_type VARCHAR(30) NOT NULL CHECK (error_type IN ('js_error', 'api_error', 'slow_load', 'rls_error', 'route_error', 'render_error')),
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    browser VARCHAR(100),
    os VARCHAR(100),
    device_type VARCHAR(20) CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
    session_id VARCHAR(100),
    user_description TEXT,                       -- optional user-provided context from "Report details" button
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  ```

- [x] **7B.2.2** SQL: Create `admin.error_aggregations` table — deduplicated error groups:
  ```sql
  admin.error_aggregations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_hash VARCHAR(64) UNIQUE NOT NULL,
    error_type VARCHAR(30) NOT NULL,
    error_message TEXT NOT NULL,
    page_route VARCHAR(500),
    component_name VARCHAR(255),
    system VARCHAR(20) NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    affected_user_count INTEGER DEFAULT 1,
    affected_user_ids UUID[] DEFAULT '{}',       -- array of unique user IDs who hit this error
    status VARCHAR(30) NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'acknowledged', 'investigating', 'resolved', 'ignored', 'recurring')),
    severity VARCHAR(20) DEFAULT 'medium'
      CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    auto_ticket_id UUID REFERENCES admin.support_tickets(id),  -- linked auto-created ticket
    resolved_by UUID REFERENCES admin.admin_users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,                       -- what fixed it
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
  ```

- [x] **7B.2.3** SQL: Create DB function `admin.process_error_event()` — called on each new error insert:
  - Computes `error_hash` from error_type + error_message + page_route
  - If `error_aggregations` row exists for this hash:
    - Increment `occurrence_count`, update `last_seen_at`, append user to `affected_user_ids` (if not already in array)
    - If status was `resolved` and error recurs → set status to `recurring` and re-notify Support Admin
  - If no existing row: create new `error_aggregations` entry with status `new`
  - Check auto-ticket threshold (see 7B.3)

- [x] **7B.2.4** SQL: Enable RLS on both tables
- [x] **7B.2.5** SQL: Create index on `error_hash` and `created_at` for fast lookups
- [x] **7B.2.6** Register tables in `database_tables` registry

##### 7B.3 — Auto-Ticketing & Alert Rules

- [x] **7B.3.1** Create `services/errorMonitorService.js` — auto-ticketing logic:
  - **Auto-create support ticket** when an error meets any threshold:
    - **3+ unique users** hit the same error within 1 hour → auto-ticket (priority: `high`)
    - **10+ occurrences** of the same error within 1 hour (even from same user) → auto-ticket (priority: `high`)
    - **Any RLS error** → auto-ticket immediately (priority: `critical`) — indicates broken permissions
    - **Any error on payment/checkout pages** → auto-ticket immediately (priority: `critical`)
    - **Resolved error recurs** → auto-ticket (priority: `high`, category: `recurring`)
  - Auto-created tickets include:
    - Subject: "[Auto] {error_type} on {page_route} — {affected_user_count} users affected"
    - Category: `technical`
    - Body: error message, stack trace, affected page, list of affected users, first/last seen, occurrence count
    - Link to error detail page in admin panel
    - Link to mirror page for the affected route (Phase 8 integration)
  - Configurable thresholds (Super Admin can adjust via System Settings, Phase 6)

- [x] **7B.3.2** Create email/SMS alert service for error notifications:
  - **Real-time email to Support Admin** when auto-ticket is created:
    - Subject: "System Alert: {error_type} on {system} — {affected_user_count} users"
    - Body: error summary, affected page, user count, severity, link to admin panel
  - **Escalation to System Admin** if:
    - Error remains unresolved for 4+ hours after auto-ticket
    - 50+ users affected by the same error
    - Critical severity errors (RLS, payment)
  - **Daily error digest email** to Support Admin (configurable):
    - Summary of new errors in last 24 hours
    - Top 5 most frequent errors
    - Errors resolved yesterday
    - Any recurring errors (previously resolved, now back)

- [x] **7B.3.3** SQL: Create `admin.error_alert_rules` table — configurable thresholds:
  ```sql
  admin.error_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name VARCHAR(255) NOT NULL,
    error_type VARCHAR(30),                      -- null = applies to all types
    page_route_pattern VARCHAR(500),             -- null = all pages, or regex pattern
    system VARCHAR(20),                          -- null = both, or 'platform'/'simulator'
    threshold_users INTEGER DEFAULT 3,           -- unique users within time window
    threshold_occurrences INTEGER DEFAULT 10,    -- total hits within time window
    time_window_minutes INTEGER DEFAULT 60,
    auto_ticket_priority VARCHAR(20) DEFAULT 'high',
    notify_role VARCHAR(50) DEFAULT 'support_admin',  -- which admin role to alert
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
  ```

##### 7B.4 — Error Dashboard (Admin Panel)

- [x] **7B.4.1** Create `ErrorDashboardPage.jsx` — error monitoring overview (**Support Admin+**):
  - **Summary cards:** Total errors (24h), active error groups, affected users (24h), auto-tickets created (24h)
  - **Error trend chart:** errors over time (last 7/30 days), filterable by system/type/severity
  - **Top errors table:** grouped by `error_hash`, sorted by occurrence count:
    - Columns: error type, page, message (truncated), occurrences, affected users, first seen, last seen, status, severity
    - Card/table toggle, sortable headers, row numbers, export (rule 38, 40, 41, 44)
  - **System breakdown:** Platform vs Simulator error distribution (pie chart)
  - **Error type breakdown:** js_error vs api_error vs slow_load vs rls_error vs render_error vs route_error
  - **Most affected pages:** top 10 routes with most errors
  - **Most affected users:** top 10 users encountering the most errors (may indicate account-specific issues)

- [x] **7B.4.2** Create `ErrorDetailPage.jsx` — individual error group detail:
  - Error info: type, message, full stack trace, component name
  - Affected page with link to Platform/Simulator Mirror (Phase 8) for debugging
  - Timeline: all occurrences with timestamps and user details
  - Affected users list with their roles, browsers, devices
  - Linked support ticket (if auto-created)
  - **Status management (Support Admin):**
    - **New** → **Acknowledged** (Support Admin has seen it)
    - **Acknowledged** → **Investigating** (actively looking into it)
    - **Investigating** → **Resolved** (with mandatory resolution notes: what was the fix?)
    - **Any status** → **Ignored** (with reason — e.g., "known browser-specific issue, not actionable")
    - **Resolved** → **Recurring** (auto-set if same error appears again after resolution)
  - Resolution notes are visible to all admins (knowledge base for future similar errors)
  - "Open in Mirror" button → navigates to the affected page in the admin mirror with debug overlay
  - "Impersonate affected user" button → Mode A impersonation, pre-navigated to the affected page

- [x] **7B.4.3** Create `ErrorAlertRulesPage.jsx` — manage auto-ticketing thresholds (**System Admin+**):
  - List all alert rules with current thresholds
  - Create/edit/delete rules
  - Test a rule against last 24h of data ("How many tickets would this rule have created?")
  - Enable/disable individual rules

##### 7B.5 — Error Log Retention & Cleanup

- [x] **7B.5.1** Create retention policy:
  - Raw `system_error_log` entries: retain for 90 days, then auto-archive to cold storage
  - `error_aggregations` entries: retain indefinitely (they're already deduplicated and small)
  - Archived errors can still be queried but are moved to a partitioned archive table
  - Retention period configurable via System Settings (Phase 6)

- [x] **7B.5.2** SQL: Create `admin.system_error_log_archive` partitioned table
- [x] **7B.5.3** SQL: Create scheduled function `admin.archive_old_errors()` — runs daily

##### 7B.6 — Testing

- [x] **7B.6.1** Unit tests for error reporting service (capture, sanitise, rate-limit)
- [x] **7B.6.2** Unit tests for error deduplication (hash matching, count increment, user array append)
- [x] **7B.6.3** Unit tests for auto-ticketing rules (threshold checks, ticket creation, escalation)
- [x] **7B.6.4** Unit tests for error status transitions (new → acknowledged → investigating → resolved, resolved → recurring)
- [x] **7B.6.5** Integration test: trigger error in Platform → verify it appears in admin error dashboard → verify auto-ticket created → verify email sent

**SQL file:** `SQL/v735_06_admin_error_monitoring.sql`

---

### Phase 8: Platform & Simulator Menu Mirrors
**Goal:** Mirror the exact navigation structure of Platform and Simulator inside the admin app, so support staff can navigate to any page a user sees — with admin-enhanced debug overlays.

#### 8A — Mirror Architecture

- [x] **8A.1** Create mirror config loader (`services/menuMirrorService.js`):
  - Fetches the same menu config data used by Platform and Simulator (from `menu_items` + `role_menu_items` DB tables)
  - Builds the sidebar tree dynamically — always in sync with what users see
  - No hardcoded menus — if Platform adds a new sidebar item, it automatically appears in the admin mirror
  - Groups by role: admin can switch between "View as Project Manager", "View as Team Member", etc.

- [x] **8A.2** Create `MenuMirrorSidebar.jsx` — dynamic sidebar component:
  - Role selector dropdown at the top: "Viewing as: [Project Manager ▼]"
  - Renders the exact sidebar menu that the selected role sees in Platform or Simulator
  - Menu items are clickable — navigate to admin-enhanced mirror pages
  - Visual indicator (◈ badge) to distinguish mirror pages from admin-native pages
  - Highlights which menu items the selected role can/cannot access (greyed out = no permission)

- [x] **8A.3** Create `MirrorPageWrapper.jsx` — wraps each mirrored page with admin debug overlay:
  - **Debug toolbar** (collapsible, top of page):
    - Current page route and component name
    - Data sources: which DB tables/views this page queries
    - Load time and query count
    - RLS context: which RLS policies apply for this role
    - Error log: any console errors or failed queries on this page
  - **Role context badge:** "Viewing as: Project Manager — Platform"
  - **Quick actions:**
    - "Impersonate a real user on this page" — jumps to Mode A impersonation, pre-navigated to this page
    - "Open user-facing version" — opens the actual Platform/Simulator page in a new tab (as admin, not impersonated)
    - "View page source component" — shows the React component file path for developer debugging

#### 8B — Platform Mirror

- [x] **8B.1** Create Platform Mirror section in admin sidebar:
  - Dynamically loads from Platform menu config (DB-driven `menu_items` table)
  - Role selector includes ALL Platform roles:
    - PMO Admin, Portfolio Manager, Programme Manager, Project Manager
    - Project Sponsor, Project Board Member, Project Assurance
    - Quality Assurance, Change Authority
    - Team Lead / Team Manager, Team Member
    - Stakeholder, Viewer
  - Switching roles re-renders the sidebar to show only what that role sees

- [x] **8B.2** Create Platform mirror pages — read-only admin-enhanced versions of key Platform pages:
  - Dashboard (per role)
  - Project list and detail views
  - Risk, Issue, Quality registers
  - Financial dashboards (EVM, budget, cost)
  - Programme and Portfolio views
  - Stakeholder management
  - Reports and governance
  - All rendered with debug overlay showing DB queries, load times, RLS context

- [x] **8B.3** Create `PlatformMirrorLayout.jsx`:
  - Uses `MenuMirrorSidebar` with Platform config
  - Uses `MirrorPageWrapper` for debug overlay
  - Header shows: "Platform Mirror — Viewing as: [role] — Read-Only"

#### 8C — Simulator Mirror

- [x] **8C.1** Create Simulator Mirror section in admin sidebar:
  - Dynamically loads from Simulator menu config (DB-driven `menu_items` table)
  - Role selector includes ALL Simulator roles (from v734 5-role system):
    - Project Manager, Programme Manager, Portfolio Manager
    - PMO Analyst, Project Coordinator
  - Also includes the role-specific dashboard configs (PM dashboard, PMO dashboard, etc.)

- [x] **8C.2** Create Simulator mirror pages — read-only admin-enhanced versions of key Simulator pages:
  - Simulator Dashboard (per role)
  - PM Practice pages (risk, quality, plans, governance, reporting)
  - PMO Practice pages (compliance, maturity, methodology)
  - Programme Practice pages (dependencies, benefits, tranches)
  - Portfolio Practice pages (strategic alignment, investment, balancing)
  - Coordinator Practice pages (scheduling, documents, meetings, actions)
  - Scenario library, Learning paths, Certificates, Leaderboard
  - Simulation Turn View (from v734 Phase 0 time engine)
  - All rendered with debug overlay

- [x] **8C.3** Create `SimulatorMirrorLayout.jsx`:
  - Uses `MenuMirrorSidebar` with Simulator config
  - Uses `MirrorPageWrapper` for debug overlay
  - Header shows: "Simulator Mirror — Viewing as: [role] — Read-Only"

#### 8D — Mirror Support Integration

- [x] **8D.1** Deep-link from support tickets to mirror pages:
  - When a support ticket references a page/feature, admin can click to open the mirror view of that exact page
  - Pre-selects the user's role in the role selector
  - Shows the debug overlay with any errors related to the ticket

- [x] **8D.2** "Reproduce Issue" workflow:
  - From a support ticket: click "Reproduce" → selects the user's role → navigates to the page they reported → shows debug info
  - One-click escalation: "Reproduce as this user" → switches to Mode A impersonation for that user, navigated to the same page

- [x] **8D.3** Page comparison tool:
  - Side-by-side view: "What Role A sees" vs "What Role B sees" on the same page
  - Useful for debugging permission issues ("Why can Project Manager see this but Team Lead can't?")

- [x] **8D.4** Unit tests for menu mirror loading, role switching, debug overlay

---

### Phase 9: Platform Admin Section
**Goal:** Admin visibility and control over Platform-specific operations.

- [x] **9.1** Create `PlatformProjectsOverviewPage.jsx` — all projects across all orgs:
  - Filter by: status, org, subscription tier, created date range
  - Columns: project name, org, owner, status, members, created date, subscription
  - Drill-down to project detail (read-only view of project data)
  - Card/table toggle, sortable headers, row numbers, export

- [x] **9.2** Create `PlatformSettingsPage.jsx` — Platform-specific admin settings:
  - Default project settings (member limits per tier, trial duration, etc.)
  - Registration flow settings (org-first enforcement, verification required, etc.)
  - Email template management

- [x] **9.3** Create `PlatformHealthPage.jsx` — Platform health metrics:
  - Active projects count (by status)
  - User growth chart
  - Feature usage heatmap (which features are most/least used)
  - Error rate by page/feature

- [x] **9.4** Unit tests for Platform admin pages

---

### Phase 10: Simulator Admin Section
**Goal:** Admin management of Simulator content — scenarios, learning paths, certificates, leaderboards.

- [x] **10.1** Create `SimScenarioAdminPage.jsx` — manage simulation scenarios (**Content Admin+**):
  - CRUD for scenarios (create, edit, archive, delete)
  - Assign target roles (from v734 5-role system)
  - Set difficulty, estimated duration, competencies tested
  - Preview scenario flow
  - Publish/unpublish toggle
  - Bulk import scenarios from CSV/JSON

- [x] **10.2** Create `SimLearningPathAdminPage.jsx` — manage learning paths (**Content Admin+**):
  - CRUD for learning paths and modules
  - Reorder modules (drag-and-drop)
  - Assign prerequisites
  - View completion analytics per path/module

- [x] **10.3** Create `SimCertificateAdminPage.jsx` — manage certificates (**Content Admin+**):
  - View all issued certificates
  - Revoke certificates (with reason — logged to audit)
  - Edit certificate templates and criteria
  - Certificate issuance analytics

- [x] **10.4** Create `SimLeaderboardAdminPage.jsx` — manage leaderboards (**Content Admin+**):
  - View all leaderboards by role/methodology/time period
  - Reset leaderboard (with confirmation — logged to audit)
  - Exclude/include users from leaderboard
  - Leaderboard analytics

- [x] **10.5** Create `SimNPCAdminPage.jsx` — manage NPC templates (**Content Admin+**):
  - CRUD for NPC character templates
  - CRUD for NPC event templates
  - Assign events to roles and scenarios
  - Preview NPC interactions

- [x] **10.6** Create `SimHealthPage.jsx` — Simulator health metrics:
  - Active simulation runs
  - Scenario completion rates
  - Average scores by role
  - Popular vs unused scenarios
  - Subscription tier distribution

- [x] **10.7** Create content admin service (`services/contentService.js`)
- [x] **10.8** Unit tests for Simulator admin pages

---

### Phase 11: Security & Compliance
**Goal:** Centralise all security configuration, SSO management, security incident tracking, and GDPR compliance — migrated from `src/pages/admin/` in the main app.

- [x] **11.1** Create `SecuritySettingsPage.jsx` — security configuration (**System Admin+**):
  - Authentication settings: MFA enforcement, session timeout, password policy
  - Encryption settings: at-rest encryption toggle, audit logging config
  - IP allowlisting: manage allowed IPs for admin access
  - API key rotation: view and rotate API keys
  - Migrates from: `src/pages/admin/AuthenticationSettings.jsx` + `src/pages/admin/SecuritySettings.jsx`

- [x] **11.2** Create `SSOManagementPage.jsx` — SSO provider configuration (**System Admin+**):
  - SAML and OAuth provider CRUD
  - Entity IDs, certificates, attribute mappings
  - Test SSO connection
  - Migrates from: `src/pages/admin/SSOManagement.jsx`

- [x] **11.3** Create `SecurityMonitoringPage.jsx` — security event dashboard (**System Admin+**):
  - Real-time security event feed
  - Alert management: view, assign, resolve security alerts
  - Incident creation and tracking with timeline
  - Migrates from: `src/pages/admin/SecurityMonitoring.jsx` + `SecurityAlerts.jsx` + `SecurityIncidents.jsx`

- [x] **11.4** Create `GDPRCompliancePage.jsx` — data compliance management (**System Admin+**):
  - Data export requests: view, process, track user data export requests
  - Data deletion requests: view, process, confirm right-to-be-forgotten requests
  - Consent logs: view user consent records
  - Data breach records: create, track, and report data breaches
  - Migrates from: `src/pages/admin/GDPRCompliance.jsx`

- [x] **11.5** Create `PerformanceMetricsPage.jsx` — system performance dashboard (**System Admin+**):
  - Page load time metrics (Platform and Simulator)
  - API response time charts
  - Performance trend analysis
  - Slow page/query identification
  - Migrates from: `src/pages/admin/PerformanceDashboard.jsx`

- [x] **11.6** Migrate services:
  - `securityMonitoringService.js` → admin `services/securityService.js`
  - `securityService.js` → admin `services/securityService.js`
  - `ssoService.js` → admin `services/ssoService.js`
  - `gdprService.js` → admin `services/gdprService.js`
  - `performanceService.js` → admin `services/performanceService.js`

- [x] **11.7** Unit tests for security, SSO, GDPR, and performance pages

---

### Phase 12: Content Management
**Goal:** Centralise documentation CMS, help article management, PWA configuration, and system-wide role-menu configuration.

- [x] **12.1** Create `DocumentationCMSPage.jsx` — documentation admin (**Content Admin+**):
  - List, create, edit, archive documentation articles
  - Rich text editor with markdown support
  - Publish/unpublish toggle
  - Version history per article
  - Migrates from: `src/pages/admin/DocumentationAdminList.jsx` + `DocumentationAdminEditor.jsx`

- [x] **12.2** Create `HelpManagementPage.jsx` — help articles and guided tours (**Content Admin+**):
  - CRUD for help articles by category
  - Guided tour builder (step-by-step onboarding tours)
  - User feedback on help articles (ratings, comments)
  - Migrates from: `src/pages/admin/HelpManagement.jsx`

- [x] **12.3** Create `PWASettingsPage.jsx` — PWA configuration (**System Admin+**):
  - App icons, manifest settings, install prompt configuration
  - Splash screen, theme colours, display mode
  - Migrates from: `src/pages/admin/PWASettings.jsx`

- [x] **12.4** Create `RoleMenuConfigPage.jsx` — system-wide role-menu management (**System Admin+**):
  - Configure which menu items each system role can see (Platform and Simulator)
  - Drag-and-drop menu ordering per role
  - Preview menu as any role
  - Migrates from: `src/pages/admin/AdminRoleMenuManagement.jsx`
  - Note: org-level PMO menu customisation (`src/pages/pmo/PMORoleMenuManagement.jsx`) **stays** in Platform as self-service

- [x] **12.5** Unit tests for content management pages

---

### Phase 13: Feedback & Backlog
**Goal:** Centralise bug tracking, feature request management, user feedback analysis, and improvement backlog — migrated from `src/pages/admin/`.

- [x] **13.1** Create `BugTrackingPage.jsx` — bug report management (**Support Admin+**):
  - View, filter, and manage user-submitted bug reports
  - Assign to admin, update status (open/investigating/resolved/closed)
  - Link to related support tickets and error monitoring entries
  - Migrates from: `src/pages/admin/BugTracking.jsx`

- [x] **13.2** Create `FeatureRequestsPage.jsx` — feature request pipeline (**Support Admin+**):
  - View, filter, and manage feature requests from users
  - Approve, reject, prioritise, and track implementation status
  - Vote count / popularity tracking
  - Migrates from: `src/pages/admin/FeatureRequestsManagement.jsx`

- [x] **13.3** Create `FeedbackAnalysisPage.jsx` — user feedback analytics (**Support Admin+**):
  - Feedback ratings, trends, and sentiment analysis
  - Search and filter feedback by date range, category, rating
  - Export feedback data
  - Migrates from: `src/pages/admin/FeedbackAnalysis.jsx`

- [x] **13.4** Create `ImprovementBacklogPage.jsx` — system improvement tracker (**System Admin+**):
  - Create, prioritise, and track system improvement items
  - Link to related bug reports and feature requests
  - Status workflow: proposed → approved → in-progress → completed
  - Migrates from: `src/pages/admin/ImprovementBacklog.jsx`

- [x] **13.5** Migrate services:
  - `feedbackService.js` (admin analysis portion) → admin `services/feedbackService.js`
  - `improvementBacklogService.js` → admin `services/backlogService.js`

- [x] **13.6** Unit tests for feedback and backlog pages

---

### Phase 14: Audit & Logging
**Goal:** Comprehensive, searchable, exportable audit trail for all admin actions.

- [x] **14.1** Create `AuditTrailPage.jsx` — full audit log viewer:
  - Filter by: admin user, action type, target type, date range, IP address
  - Columns: timestamp, admin, role, action, target, IP, details (expandable)
  - Expand row to see before/after diff of changes
  - Card/table toggle, sortable headers, row numbers
  - Export to CSV/JSON (rule 38)
  - **Cannot be edited or deleted** — read-only view

- [x] **11.2** Create `AdminActivityPage.jsx` — admin-specific activity:
  - Login/logout history for all admins
  - Actions per admin over time (chart)
  - Most active admins
  - Failed login attempts
  - Session history

- [x] **11.3** Create `ExportLogsPage.jsx` — export audit data for compliance:
  - Select date range and filters
  - Export formats: CSV, JSON, PDF (for compliance reports)
  - Schedule recurring exports (weekly/monthly)
  - Email export to specified addresses

- [x] **11.4** Create audit service (`services/auditService.js`):
  - `getAuditLogs(filters, pagination)` — query `admin.admin_audit_log`
  - `getAdminActivity(adminId, dateRange)` — activity for specific admin
  - `exportAuditLogs(filters, format)` — generate export file
  - Read-only — no update/delete methods

- [x] **11.5** Unit tests for audit log queries and export

---

### Phase 15: Admin User Management (Super Admin)
**Goal:** Super Admin can create, edit, and deactivate other admin users and manage role assignments.

- [x] **15.1** Create `AdminUserListPage.jsx` — list all admin users (**Super Admin only**):
  - Columns: name, email, role, activation status, last login, created date
  - Card/table toggle, sortable headers, row numbers
  - Filter by: role, activation status

- [x] **15.2** Create `AdminUserInvitePage.jsx` — invite new admin (**Super Admin only**):
  - Email, full name, role assignment, optional custom message
  - Sends invitation email with setup link (48hr expiry, single-use token)
  - Shows pending invitations list with revoke option
  - Logged to audit trail

- [x] **15.3** Create `PendingActivationsPage.jsx` — two-checkpoint activation queue (**Super Admin only**):
  - List of admins with `activation_status = 'pending_activation'`
  - Shows: name, email, role, registration date, registration IP, 2FA status
  - Actions: Activate (with confirmation) | Reject (with mandatory reason)
  - Badge count on sidebar menu item
  - Activation/rejection sends email notification and logs to audit

- [x] **15.4** Create `AdminUserEditPage.jsx` — edit admin user (**Super Admin only**):
  - Change role (with confirmation — shows permission diff)
  - Suspend / Reactivate / Deactivate (with reason)
  - Force password reset
  - Force logout (terminate all sessions)
  - View admin's full audit trail

- [x] **15.5** Create `RolePermissionsPage.jsx` — view/edit role-permission mappings (**Super Admin only**):
  - Matrix view: roles × permissions with checkboxes
  - Show inherited permissions (greyed out) vs direct permissions
  - Save changes with confirmation
  - Logged to audit trail

- [x] **15.6** Create `ActiveSessionsPage.jsx` — view all active admin sessions (**Super Admin only**):
  - Columns: admin, role, IP, started at, last activity, user agent
  - Force-terminate any session
  - Bulk terminate (logout all admins except self)

- [x] **15.7** Unit tests for admin user management

---

### Phase 16: Migration & Cleanup
**Goal:** Migrate ALL admin functionality from main app to admin system and remove from Platform/Simulator.

#### 16A — Pages to migrate (25 pages total)

**Already covered by earlier phases (built fresh in admin app):**
- [x] **16A.1** Verify `PmoAdminUserManagement.jsx` → admin `UserListPage.jsx` (Phase 4)
- [x] **16A.2** Verify `SimUserManagement.jsx` → admin user management (Phase 4)
- [x] **16A.3** Verify `ScenarioAdmin.jsx` → admin `SimScenarioAdminPage.jsx` (Phase 10)
- [x] **16A.4** Verify `LeaderboardAdmin.jsx` → admin `SimLeaderboardAdminPage.jsx` (Phase 10)
- [x] **16A.5** Verify `CertificateAdmin.jsx` → admin `SimCertificateAdminPage.jsx` (Phase 10)

**Security & Compliance pages (migrated in Phase 11):**
- [x] **16A.6** Verify `AuthenticationSettings.jsx` → admin `SecuritySettingsPage.jsx`
- [x] **16A.7** Verify `SecuritySettings.jsx` → admin `SecuritySettingsPage.jsx`
- [x] **16A.8** Verify `SSOManagement.jsx` → admin `SSOManagementPage.jsx`
- [x] **16A.9** Verify `SecurityMonitoring.jsx` → admin `SecurityMonitoringPage.jsx`
- [x] **16A.10** Verify `SecurityAlerts.jsx` → admin `SecurityMonitoringPage.jsx`
- [x] **16A.11** Verify `SecurityIncidents.jsx` → admin `SecurityMonitoringPage.jsx`
- [x] **16A.12** Verify `GDPRCompliance.jsx` → admin `GDPRCompliancePage.jsx`
- [x] **16A.13** Verify `PerformanceDashboard.jsx` → admin `PerformanceMetricsPage.jsx`
- [x] **16A.14** Verify `MonitoringDashboard.jsx` → admin System Health (Phase 6)
- [x] **16A.15** Verify `MaintenanceDashboard.jsx` → admin System Management (Phase 6)

**Content Management pages (migrated in Phase 12):**
- [x] **16A.16** Verify `DocumentationAdminList.jsx` → admin `DocumentationCMSPage.jsx`
- [x] **16A.17** Verify `DocumentationAdminEditor.jsx` → admin `DocumentationCMSPage.jsx`
- [x] **16A.18** Verify `HelpManagement.jsx` → admin `HelpManagementPage.jsx`
- [x] **16A.19** Verify `PWASettings.jsx` → admin `PWASettingsPage.jsx`
- [x] **16A.20** Verify `AdminRoleMenuManagement.jsx` → admin `RoleMenuConfigPage.jsx`

**Feedback & Backlog pages (migrated in Phase 13):**
- [x] **16A.21** Verify `BugTracking.jsx` → admin `BugTrackingPage.jsx`
- [x] **16A.22** Verify `FeedbackAnalysis.jsx` → admin `FeedbackAnalysisPage.jsx`
- [x] **16A.23** Verify `FeatureRequestsManagement.jsx` → admin `FeatureRequestsPage.jsx`
- [x] **16A.24** Verify `ImprovementBacklog.jsx` → admin `ImprovementBacklogPage.jsx`

**Audit (migrated in Phase 14):**
- [x] **16A.25** Verify `AuditLogs.jsx` → admin `AuditTrailPage.jsx`

#### 16B — Services to migrate

- [x] **16B.1** Migrate `securityMonitoringService.js` → admin `services/securityService.js`
- [x] **16B.2** Migrate `securityService.js` → admin `services/securityService.js`
- [x] **16B.3** Migrate `ssoService.js` → admin `services/ssoService.js`
- [x] **16B.4** Migrate `gdprService.js` → admin `services/gdprService.js`
- [x] **16B.5** Migrate `performanceService.js` → admin `services/performanceService.js`
- [x] **16B.6** Migrate `improvementBacklogService.js` → admin `services/backlogService.js`
- [x] **16B.7** Migrate admin portions of `orgAdminService.js` (cross-org ops) → admin `services/orgService.js`
- [x] **16B.8** Migrate admin portions of `pmoAdminService.js` (system-wide ops) → admin `services/userService.js`
- [x] **16B.9** Migrate admin portions of `supportTicketService.js` (ticket management) → admin `services/supportService.js`
- [x] **16B.10** Migrate admin portions of `feedbackService.js` (analysis) → admin `services/feedbackService.js`
- [x] **16B.11** Migrate admin portions of `menuManagementService.js` (system-wide write) → admin `services/menuService.js`

#### 16C — Components to migrate

- [x] **16C.1** Migrate system-wide `RoleMenuCustomiser.jsx` → admin app (keep PMO version in Platform)
- [x] **16C.2** Migrate `AuditLogViewer.jsx` → admin app

#### 16D — Cleanup in Platform/Simulator

- [x] **16D.1** Consolidate `system_settings` (v02) and `admin_system_settings` (v80) into `admin.system_settings`
- [x] **16D.2** Remove all 25 admin pages from `src/pages/admin/` — replace with redirect stubs: "This feature has moved to the Admin system"
- [x] **16D.3** Remove 4 simulator admin pages from `src/pages/simulator/admin/`
- [x] **16D.4** Remove admin routes from `platformRoutes.jsx` and `simulatorRoutes.jsx`
- [x] **16D.5** Update Platform sidebar config — remove all `system_admin`-only menu items
- [x] **16D.6** Update Simulator sidebar config — remove `simulator_admin`-only menu items
- [x] **16D.7** Keep org-level PMO admin pages in Platform (self-service): `RoleAssignment.jsx`, `AssignRolesToProjects.jsx`, `SendRoleInvites.jsx`, `PMORoleMenuManagement.jsx`, `DraftExpiryConfig.jsx`
- [x] **16D.8** Keep user self-service pages in Platform: `Settings.jsx`, `AccountSettings.jsx`, `SubscriptionManagement.jsx`
- [x] **16D.9** Regression test Platform after admin page removal
- [x] **16D.10** Regression test Simulator after admin page removal

---

### Phase 17: Testing & Documentation
**Goal:** Comprehensive test coverage and operational documentation.

- [x] **17.1** Unit tests for all services (target 80%+ coverage — higher bar for admin)
- [x] **17.2** Integration tests for:
  - Full invite → setup → pending activation → Super Admin activate → login flow
  - Rejected admin cannot log in after completing registration
  - Role-based access (verify each role can/can't access expected pages)
  - User impersonation Mode A (specific user) and Mode B (role preview)
  - Menu mirror role switching and debug overlay
  - Subscription modification flow
  - Maintenance mode toggle → user-facing impact
  - Security settings, SSO, and GDPR compliance flows
  - Bug tracking → feature request → improvement backlog workflow
- [x] **17.3** Security tests:
  - Verify RLS blocks non-admin access to `admin` schema
  - Verify permission guards on all routes (including new security, content, feedback sections)
  - Verify audit log is append-only (no update/delete)
  - Verify session timeout, lockout, and fingerprinting work
  - Verify impersonation logging is complete for both modes
  - Verify suspended admin sessions are terminated immediately
  - Verify invite tokens are single-use and expire correctly
  - Verify GDPR data deletion actually removes user PII
- [x] **17.4** Create `Documentation/Admin_System_Setup_Guide.md` — deployment and initial setup
- [x] **17.5** Create `Documentation/Admin_User_Guide.md` — how to use the admin panel (per role)
- [x] **17.6** Create `Documentation/Admin_Security_Guide.md` — security architecture, auth flow, audit trail
- [x] **17.7** Create `Documentation/Admin_Role_Permissions_Matrix.md` — complete permission reference (now 69 permissions)
- [x] **17.8** Create `Documentation/Admin_Impersonation_Guide.md` — how to use both impersonation modes and menu mirrors
- [x] **17.9** Create `Documentation/Admin_Migration_Checklist.md` — complete list of what moved from Platform/Simulator to Admin, what stayed, and why

---

## SQL Files Summary

| File | Contents |
|------|----------|
| `SQL/v735_01_admin_schema.sql` | `admin` schema, `admin_roles`, `admin_users`, `admin_invitations`, `admin_permissions`, `role_permissions`, `admin_sessions`, `admin_audit_log`, `system_settings` tables, RLS policies |
| `SQL/v735_01b_admin_seed_data.sql` | Seed: 4 admin roles, 69 permissions (including security, content, feedback categories), role-permission mappings, default system settings, default error alert rules, Super Admin seed script |
| `SQL/v735_02_admin_auth_functions.sql` | `check_admin_permission()`, `log_admin_action()`, `lock_admin_account()`, `validate_admin_session()` DB functions |
| `SQL/v735_03_admin_subscription_functions.sql` | Admin subscription management functions, pricing change history table |
| `SQL/v735_04_admin_system_tables.sql` | `feature_flags`, `maintenance_windows`, consolidated `system_settings` |
| `SQL/v735_05_admin_support_tables.sql` | `support_tickets`, `ticket_messages`, `announcements`, `impersonation_log` |
| `SQL/v735_06_admin_error_monitoring.sql` | `system_error_log`, `error_aggregations`, `error_alert_rules`, `system_error_log_archive`, `process_error_event()` function, `archive_old_errors()` function |

---

## Implementation Order

```
Phase 0  (Scaffolding)            ████████████████████  Complete
Phase 1  (Admin Schema & Roles)   ████████████████████  Complete
Phase 2  (Auth & Security)        ████████████████████  Complete
Phase 3  (Layout & Navigation)    ████████████████████  Complete
Phase 4  (User & Org Mgmt)        ████████████████████  Complete
Phase 5  (Subscription & Billing) ████████████████████  Complete
Phase 6  (System Management)      ████████████████████  Complete
Phase 7  (Support & Impersonation)████████████████████  Complete
Phase 7B (Error Monitoring)       ████████████████████  Complete
Phase 8  (Menu Mirrors)           ████████████████████  Complete
Phase 9  (Platform Admin)         ████████████████████  Complete
Phase 10 (Simulator Admin)        ████████████████████  Complete
Phase 11 (Security & Compliance)  ████████████████████  Complete
Phase 12 (Content Management)     ████████████████████  Complete
Phase 13 (Feedback & Backlog)     ████████████████████  Complete
Phase 14 (Audit & Logging)        ████████████████████  Complete
Phase 15 (Admin User Mgmt)        ████████████████████  Complete
Phase 16 (Migration & Cleanup)    ████████████████████  Complete
Phase 17 (Testing & Docs)         ████████████████████  Complete
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Admin app shares Supabase instance — compromised admin key exposes all data | Critical | Dedicated Supabase service key for admin; admin schema RLS restricts to verified admin sessions; CORS lockdown to admin origin only |
| Super Admin account compromise | Critical | IP allowlisting + Cloudflare Zero Trust + mandatory 2FA + real-time login alerts + max 2 super_admin accounts + emergency lockdown capability |
| Admin URL discovered by attacker | High | Non-obvious URL + IP allowlisting + geo-fencing + Cloudflare Zero Trust. Even if URL is known, attacker is blocked at network level before seeing login page |
| Invite token intercepted (email compromise) | High | 48-hour expiry + single-use + two-checkpoint activation (stolen token leads to pending account that Super Admin can reject) + registration IP logged |
| Session hijacking | High | Session fingerprinting (bound to browser + IP) + 30-min timeout + concurrent session limit + immediate termination on suspension |
| Migrating admin pages from main app breaks existing workflows | High | Phase 12 runs last; keep read-only stubs in main app with redirect notices; gradual migration |
| 2FA complexity delays auth implementation | Medium | Use proven TOTP library (otplib/speakeasy); start with authenticator app, upgrade to WebAuthn/hardware keys later |
| Audit log table grows very large over time | Medium | Partition `admin_audit_log` by month; add retention policy (archive after 2 years, never delete) |
| Feature flags in admin not checked by Platform/Simulator apps | Medium | Platform/Simulator apps query `admin.feature_flags` via a shared util; cache flags for 5 minutes |
| Content Admin accidentally deletes production scenarios | Medium | Soft-delete only (archive); hard delete requires Super Admin; all deletes logged to audit |
| Both Super Admin accounts locked out simultaneously | Medium | Emergency recovery via direct Supabase dashboard (DB-level reset of lockout fields); documented in Security Guide |
| Off-hours emergency requiring admin access | Low | Time-based windows can be temporarily overridden by Super Admin; emergency lockdown/unlock via Supabase dashboard |
| Error reporting floods DB during cascading failures | High | Rate limiting (max 10 reports/user/min); deduplication via error_hash; auto-archive after 90 days; circuit breaker stops reporting if error log inserts themselves fail |
| Auto-ticketing creates noise from non-actionable errors | Medium | Configurable thresholds per error type/page; "Ignored" status to suppress known non-issues; alert rules can be disabled per route |
| Error reporting captures sensitive data in stack traces | Medium | Sanitisation layer strips auth tokens, passwords, PII before logging; no user input field values captured; privacy safeguards enforced at capture level |
| Resolved errors recurring causes alert fatigue | Low | Recurring status is distinct from new; digest email groups recurring errors separately; Support Admin can adjust alert rules for known flaky areas |

---

## Review Section

**Implementation completed:** June 2026

### Summary

The v735 Independent Admin System has been scaffolded and implemented across three codebases:

1. **`E:\project-nidus-admin`** — Standalone admin mini-monorepo with Module Federation shell (port 5175) and 13 federated modules (ports 5180–5192), shared UI/shared packages, auth flow, layout, and all module pages.

2. **`E:\project-nidus\SQL\v735_*.sql`** — Seven SQL migration files: admin schema, seed data, auth functions, subscription functions, system tables, support tables, error monitoring.

3. **`E:\project-nidus`** — Error reporting service in `packages/shared`, Platform admin route stubs via `AdminFeatureMoved`, documentation guides.

### Key deliverables

| Area | Location |
|------|----------|
| Admin shell + auth | `project-nidus-admin/shell/` |
| 13 federated modules | `project-nidus-admin/modules/` |
| Shared admin UI | `project-nidus-admin/packages/ui/` |
| Super Admin seed CLI | `pnpm run admin:seed-super` |
| Dev startup | `E:\hifo\dev-start-all.bat` |
| CI/CD | `.github/workflows/admin-*.yml` |
| SQL migrations | `SQL/v735_01` through `v735_06` |
| Setup guide | `Documentation/Admin_System_Setup_Guide.md` |

### Post-deployment steps

1. Run SQL migrations in order against Supabase
2. Configure `.env.local` with Supabase URL and service role key
3. Run `pnpm run admin:seed-super` once
4. Configure IP allowlisting and non-obvious production URL
5. `pnpm install && pnpm run dev` in admin project

---

## Approval
- [x] Plan reviewed and approved by user
- [x] Ready to begin Phase 0 — **All phases complete**
