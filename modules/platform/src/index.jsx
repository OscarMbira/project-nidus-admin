import { Routes, Route, Navigate } from 'react-router-dom'
import PlatformProjectsOverviewPage from './pages/PlatformProjectsOverviewPage.jsx'
import PlatformSettingsPage from './pages/PlatformSettingsPage.jsx'
import PlatformHealthPage from './pages/PlatformHealthPage.jsx'
import PlatformImpersonationPage from './pages/PlatformImpersonationPage.jsx'

export default function PlatformRoutes() {
  return (
    <Routes>
      <Route path="platform-projects-overview" element={<PlatformProjectsOverviewPage />} />
      <Route path="platform-settings" element={<PlatformSettingsPage />} />
      <Route path="platform-health" element={<PlatformHealthPage />} />
      <Route path="user-impersonation" element={<PlatformImpersonationPage />} />
      <Route path="*" element={<Navigate to="platform-projects-overview" replace />} />
    </Routes>
  )
}
