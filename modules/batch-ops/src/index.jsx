import { Routes, Route, Navigate } from 'react-router-dom'
import BatchJobListPage from './pages/BatchJobListPage.jsx'
import BatchJobDetailPage from './pages/BatchJobDetailPage.jsx'
import BatchImportPage from './pages/BatchImportPage.jsx'
import BusinessCalendarPage from './pages/BusinessCalendarPage.jsx'
import CobProcessesPage from './pages/CobProcessesPage.jsx'
import CobDashboardPage from './pages/CobDashboardPage.jsx'
import CobRunDetailPage from './pages/CobRunDetailPage.jsx'

export default function BatchOpsRoutes() {
  return (
    <Routes>
      <Route path="batch-jobs" element={<BatchJobListPage />} />
      <Route path="batch-job-detail" element={<BatchJobDetailPage />} />
      <Route path="batch-import" element={<BatchImportPage />} />
      <Route path="cob-dashboard" element={<CobDashboardPage />} />
      <Route path="business-calendar" element={<BusinessCalendarPage />} />
      <Route path="cob-processes" element={<CobProcessesPage />} />
      <Route path="cob-run-detail" element={<CobRunDetailPage />} />
      <Route path="*" element={<Navigate to="batch-jobs" replace />} />
    </Routes>
  )
}
