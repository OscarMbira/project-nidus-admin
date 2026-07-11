import { Routes, Route, Navigate } from 'react-router-dom'
import AdminUserListPage from './pages/AdminUserListPage.jsx'
import AdminUserInvitePage from './pages/AdminUserInvitePage.jsx'
import PendingActivationsPage from './pages/PendingActivationsPage.jsx'
import AdminUserEditPage from './pages/AdminUserEditPage.jsx'
import RolePermissionsPage from './pages/RolePermissionsPage.jsx'
import NavigationManagementPage from './pages/NavigationManagementPage.jsx'
import ActiveSessionsPage from './pages/ActiveSessionsPage.jsx'

import LifecycleConfigurationPage from './pages/LifecycleConfigurationPage.jsx'
import AuthorisersPage from './pages/AuthorisersPage.jsx'
import ArchiveRetentionRulesPage from './pages/ArchiveRetentionRulesPage.jsx'
import MyApprovalsPage from './pages/MyApprovalsPage.jsx'

export default function AdminMgmtRoutes() {
  return (
    <Routes>
      <Route path="admin-user-list" element={<AdminUserListPage />} />
      <Route path="admin-user-invite" element={<AdminUserInvitePage />} />
      <Route path="pending-activations" element={<PendingActivationsPage />} />
      <Route path="admin-user-edit" element={<AdminUserEditPage />} />
      <Route path="role-permissions" element={<RolePermissionsPage />} />
      <Route path="navigation-management" element={<NavigationManagementPage />} />
      <Route path="active-sessions" element={<ActiveSessionsPage />} />
      <Route path="record-governance/lifecycle-configuration" element={<LifecycleConfigurationPage />} />
      <Route path="record-governance/authorisers" element={<AuthorisersPage />} />
      <Route path="record-governance/archive-retention-rules" element={<ArchiveRetentionRulesPage />} />
      <Route path="record-governance/my-approvals" element={<MyApprovalsPage />} />
      <Route path="*" element={<Navigate to="admin-user-list" replace />} />
    </Routes>
  )
}
