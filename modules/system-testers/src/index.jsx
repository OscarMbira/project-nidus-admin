import { Routes, Route, Navigate } from 'react-router-dom'
import TesterApplicationsPage from './pages/TesterApplicationsPage.jsx'
import ActiveTestersPage from './pages/ActiveTestersPage.jsx'
import GrantTesterAccessPage from './pages/GrantTesterAccessPage.jsx'
import TesterAssignmentsPage from './pages/TesterAssignmentsPage.jsx'
import TesterSandboxesPage from './pages/TesterSandboxesPage.jsx'
import TesterExpiryPage from './pages/TesterExpiryPage.jsx'
import TesterActivityPage from './pages/TesterActivityPage.jsx'

export default function SystemTestersRoutes() {
  return (
    <Routes>
      <Route path="applications" element={<TesterApplicationsPage />} />
      <Route path="active" element={<ActiveTestersPage />} />
      <Route path="grant" element={<GrantTesterAccessPage />} />
      <Route path="assignments" element={<TesterAssignmentsPage />} />
      <Route path="sandboxes" element={<TesterSandboxesPage />} />
      <Route path="expiry" element={<TesterExpiryPage />} />
      <Route path="activity" element={<TesterActivityPage />} />
      <Route path="*" element={<Navigate to="applications" replace />} />
    </Routes>
  )
}
