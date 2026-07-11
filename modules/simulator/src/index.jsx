import { Routes, Route, Navigate } from 'react-router-dom'
import SimScenarioAdminPage from './pages/SimScenarioAdminPage.jsx'
import SimScenarioDetailPage from './pages/SimScenarioDetailPage.jsx'
import SimLearningPathAdminPage from './pages/SimLearningPathAdminPage.jsx'
import SimCertificateAdminPage from './pages/SimCertificateAdminPage.jsx'
import SimLeaderboardAdminPage from './pages/SimLeaderboardAdminPage.jsx'
import SimNPCAdminPage from './pages/SimNPCAdminPage.jsx'
import SimHealthPage from './pages/SimHealthPage.jsx'
import SimImpersonationPage from './pages/SimImpersonationPage.jsx'

export default function SimulatorRoutes() {
  return (
    <Routes>
      <Route path="sim-scenario-admin" element={<SimScenarioAdminPage />} />
      <Route path="sim-scenario-detail" element={<SimScenarioDetailPage />} />
      <Route path="sim-learning-path-admin" element={<SimLearningPathAdminPage />} />
      <Route path="sim-certificate-admin" element={<SimCertificateAdminPage />} />
      <Route path="sim-leaderboard-admin" element={<SimLeaderboardAdminPage />} />
      <Route path="sim-n-p-c-admin" element={<SimNPCAdminPage />} />
      <Route path="sim-health" element={<SimHealthPage />} />
      <Route path="user-impersonation" element={<SimImpersonationPage />} />
      <Route path="*" element={<Navigate to="sim-scenario-admin" replace />} />
    </Routes>
  )
}
