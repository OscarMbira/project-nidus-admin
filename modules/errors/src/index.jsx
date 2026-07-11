import { Routes, Route, Navigate } from 'react-router-dom'
import ErrorDashboardPage from './pages/ErrorDashboardPage.jsx'
import ErrorDetailPage from './pages/ErrorDetailPage.jsx'
import ErrorAlertRulesPage from './pages/ErrorAlertRulesPage.jsx'

export default function ErrorsRoutes() {
  return (
    <Routes>
      <Route path="error-dashboard" element={<ErrorDashboardPage />} />
      <Route path="error-detail" element={<ErrorDetailPage />} />
      <Route path="error-alert-rules" element={<ErrorAlertRulesPage />} />
      <Route path="*" element={<Navigate to="error-dashboard" replace />} />
    </Routes>
  )
}
