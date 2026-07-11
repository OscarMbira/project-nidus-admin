import { Routes, Route, Navigate } from 'react-router-dom'
import SecuritySettingsPage from './pages/SecuritySettingsPage.jsx'
import SSOManagementPage from './pages/SSOManagementPage.jsx'
import SecurityMonitoringPage from './pages/SecurityMonitoringPage.jsx'
import GDPRCompliancePage from './pages/GDPRCompliancePage.jsx'
import PerformanceMetricsPage from './pages/PerformanceMetricsPage.jsx'
import APIKeyListPage from './pages/APIKeyListPage.jsx'
import WebhookListPage from './pages/WebhookListPage.jsx'
import WebhookDeliveryLogPage from './pages/WebhookDeliveryLogPage.jsx'

export default function SecurityRoutes() {
  return (
    <Routes>
      <Route path="security-settings" element={<SecuritySettingsPage />} />
      <Route path="s-s-o-management" element={<SSOManagementPage />} />
      <Route path="security-monitoring" element={<SecurityMonitoringPage />} />
      <Route path="g-d-p-r-compliance" element={<GDPRCompliancePage />} />
      <Route path="performance-metrics" element={<PerformanceMetricsPage />} />
      <Route path="api-keys" element={<APIKeyListPage />} />
      <Route path="webhooks" element={<WebhookListPage />} />
      <Route path="webhook-log" element={<WebhookDeliveryLogPage />} />
      <Route path="*" element={<Navigate to="security-settings" replace />} />
    </Routes>
  )
}
