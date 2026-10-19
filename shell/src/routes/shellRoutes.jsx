import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from '../components/layout/AdminLayout.jsx'
import PopoutShell from '../components/layout/PopoutShell.jsx'
import { RoleGuard } from '../components/guards/RoleGuard.jsx'
import { ModuleErrorBoundary } from '../components/ModuleErrorBoundary.jsx'
import { lazyRemote } from '../utils/lazyRemote.js'
import ModuleLoadingFallback from '../components/ModuleLoadingFallback.jsx'
import AdminLogin from '../pages/auth/AdminLogin.jsx'
import AccountSetup from '../pages/auth/AccountSetup.jsx'
import TwoFactorSetup from '../pages/auth/TwoFactorSetup.jsx'
import FirstLoginTwoFactorSetup from '../pages/auth/FirstLoginTwoFactorSetup.jsx'
import AdminDashboard from '../pages/dashboard/AdminDashboard.jsx'
import AdminProfile from '../pages/profile/AdminProfile.jsx'
import PendingActivation from '../pages/auth/PendingActivation.jsx'

const UsersModule = lazyRemote(() => import('admin_users/routes'))
const SubsModule = lazyRemote(() => import('admin_subscriptions/routes'))
const SystemModule = lazyRemote(() => import('admin_system/routes'))
const SupportModule = lazyRemote(() => import('admin_support/routes'))
const ErrorsModule = lazyRemote(() => import('admin_errors/routes'))
const MirrorsModule = lazyRemote(() => import('admin_mirrors/routes'))
const PlatformModule = lazyRemote(() => import('admin_platform/routes'))
const SimulatorModule = lazyRemote(() => import('admin_simulator/routes'))
const SecurityModule = lazyRemote(() => import('admin_security/routes'))
const ContentModule = lazyRemote(() => import('admin_content/routes'))
const FeedbackModule = lazyRemote(() => import('admin_feedback/routes'))
const AuditModule = lazyRemote(() => import('admin_audit/routes'))
const AdminMgmtModule = lazyRemote(() => import('admin_admin_mgmt/routes'))
const BatchOpsModule = lazyRemote(() => import('admin_batch_ops/routes'))
const AffiliatesModule = lazyRemote(() => import('admin_affiliates/routes'))
const SystemTestersModule = lazyRemote(() => import('admin_system_testers/routes'))
const DocsCentreModule = lazyRemote(() => import('admin_docs_centre/routes'))
const TestingCentreModule = lazyRemote(() => import('admin_testing_centre/routes'))
const EmailCentreModule = lazyRemote(() => import('admin_email_centre/routes'))
const AiCentreModule = lazyRemote(() => import('admin_ai/routes'))

// Single source of truth for module route mounting — rendered once under AdminLayout
// (full shell chrome) and again under PopoutShell (chromeless, for detached/second-monitor
// windows opened via the DetachButton component) so every module gets both automatically.
const MODULE_ROUTES = [
  { path: 'users', module: 'users', Component: UsersModule },
  { path: 'subscriptions', module: 'subscriptions', Component: SubsModule },
  { path: 'system', module: 'system', Component: SystemModule },
  { path: 'support', module: 'support', Component: SupportModule },
  { path: 'errors', module: 'errors', Component: ErrorsModule },
  { path: 'mirrors', module: 'mirrors', Component: MirrorsModule },
  { path: 'platform', module: 'platform', Component: PlatformModule },
  { path: 'simulator', module: 'simulator', Component: SimulatorModule },
  { path: 'security', module: 'security', Component: SecurityModule },
  { path: 'content', module: 'content', Component: ContentModule },
  { path: 'feedback', module: 'feedback', Component: FeedbackModule },
  { path: 'audit', module: 'audit', Component: AuditModule },
  { path: 'batch-ops', module: 'batch-ops', Component: BatchOpsModule },
  { path: 'affiliates', module: 'affiliates', Component: AffiliatesModule },
  { path: 'system-testers', module: 'system-testers', Component: SystemTestersModule },
  { path: 'docs-centre', module: 'docs-centre', Component: DocsCentreModule },
  { path: 'testing-centre', module: 'testing-centre', Component: TestingCentreModule },
  { path: 'email-centre', module: 'email-centre', Component: EmailCentreModule },
  { path: 'ai', module: 'ai', Component: AiCentreModule },
  { path: 'admin-mgmt', module: 'admin-mgmt', Component: AdminMgmtModule },
]

const SHELL_ROLES = ['super_admin', 'system_admin', 'support_admin', 'content_admin']

function ModuleRoute({ module, children }) {
  return (
    <ModuleErrorBoundary module={module}>
      <Suspense fallback={<ModuleLoadingFallback module={module} />}>{children}</Suspense>
    </ModuleErrorBoundary>
  )
}

export default function ShellRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route path="/setup/:token" element={<AccountSetup />} />
      <Route path="/setup/:token/2fa" element={<TwoFactorSetup />} />
      <Route path="/auth/2fa-setup" element={<FirstLoginTwoFactorSetup />} />
      <Route path="/pending-activation" element={<PendingActivation />} />
      <Route element={<RoleGuard roles={SHELL_ROLES}><AdminLayout /></RoleGuard>}>
        <Route path="/dashboard" element={<AdminDashboard />} />
        <Route path="/profile" element={<AdminProfile />} />
        {MODULE_ROUTES.map(({ path, module, Component }) => (
          <Route
            key={path}
            path={`/${path}/*`}
            element={<ModuleRoute module={module}><Component /></ModuleRoute>}
          />
        ))}
      </Route>
      <Route element={<RoleGuard roles={SHELL_ROLES}><PopoutShell /></RoleGuard>}>
        {MODULE_ROUTES.map(({ path, module, Component }) => (
          <Route
            key={`popout-${path}`}
            path={`/popout/${path}/*`}
            element={<ModuleRoute module={module}><Component /></ModuleRoute>}
          />
        ))}
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
