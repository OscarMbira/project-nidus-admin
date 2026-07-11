import { Routes, Route, Navigate } from 'react-router-dom'
import TestingDashboardPage from './pages/TestingDashboardPage.jsx'
import TestCasesPage from './pages/TestCasesPage.jsx'
import TestSuitesPage from './pages/TestSuitesPage.jsx'
import TestRunsPage from './pages/TestRunsPage.jsx'
import TestRunDetailPage from './pages/TestRunDetailPage.jsx'
import EvidencePage from './pages/EvidencePage.jsx'
import DiagnosticsPage from './pages/DiagnosticsPage.jsx'
import DefectsPage from './pages/DefectsPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

export default function TestingCentreRoutes() {
  return (
    <Routes>
      <Route index element={<TestingDashboardPage />} />
      <Route path="cases" element={<TestCasesPage />} />
      <Route path="suites" element={<TestSuitesPage />} />
      <Route path="runs" element={<TestRunsPage />} />
      <Route path="runs/:runId" element={<TestRunDetailPage />} />
      <Route path="evidence" element={<EvidencePage />} />
      <Route path="diagnostics" element={<DiagnosticsPage />} />
      <Route path="defects" element={<DefectsPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  )
}
