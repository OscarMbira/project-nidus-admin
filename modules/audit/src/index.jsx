import { Routes, Route, Navigate } from 'react-router-dom'
import AuditTrailPage from './pages/AuditTrailPage.jsx'
import AdminActivityPage from './pages/AdminActivityPage.jsx'
import ExportLogsPage from './pages/ExportLogsPage.jsx'
import SessionHistoryPage from './pages/SessionHistoryPage.jsx'
import ReportListPage from './pages/ReportListPage.jsx'
import ReportBuilderPage from './pages/ReportBuilderPage.jsx'
import ScheduledReportsPage from './pages/ScheduledReportsPage.jsx'
import ReportViewerPage from './pages/ReportViewerPage.jsx'

export default function AuditRoutes() {
  return (
    <Routes>
      <Route path="audit-trail" element={<AuditTrailPage />} />
      <Route path="admin-activity" element={<AdminActivityPage />} />
      <Route path="session-history" element={<SessionHistoryPage />} />
      <Route path="export-logs" element={<ExportLogsPage />} />
      <Route path="reports" element={<ReportListPage />} />
      <Route path="report-builder" element={<ReportBuilderPage />} />
      <Route path="scheduled-reports" element={<ScheduledReportsPage />} />
      <Route path="report-viewer" element={<ReportViewerPage />} />
      <Route path="*" element={<Navigate to="audit-trail" replace />} />
    </Routes>
  )
}
