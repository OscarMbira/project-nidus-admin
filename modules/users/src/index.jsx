import { Routes, Route, Navigate } from 'react-router-dom'
import UserListPage from './pages/UserListPage.jsx'
import UserDetailPage from './pages/UserDetailPage.jsx'
import OrgListPage from './pages/OrgListPage.jsx'
import OrgDetailPage from './pages/OrgDetailPage.jsx'
import UserSuspendPage from './pages/UserSuspendPage.jsx'
import UserActivityPage from './pages/UserActivityPage.jsx'

export default function UsersRoutes() {
  return (
    <Routes>
      <Route path="user-list" element={<UserListPage />} />
      <Route path="user-detail" element={<UserDetailPage />} />
      <Route path="user-suspend" element={<UserSuspendPage />} />
      <Route path="org-list" element={<OrgListPage />} />
      <Route path="org-detail" element={<OrgDetailPage />} />
      <Route path="user-activity" element={<UserActivityPage />} />
      <Route path="*" element={<Navigate to="user-list" replace />} />
    </Routes>
  )
}
