import { Routes, Route, Navigate } from 'react-router-dom'
import EmailDashboardPage from './pages/EmailDashboardPage.jsx'
import ComposeEmailPage from './pages/ComposeEmailPage.jsx'
import CampaignListPage from './pages/CampaignListPage.jsx'
import CampaignEditorPage from './pages/CampaignEditorPage.jsx'
import EventTriggersPage from './pages/EventTriggersPage.jsx'
import EmailSendLogPage from './pages/EmailSendLogPage.jsx'

export default function EmailCentreRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<EmailDashboardPage />} />
      <Route path="compose" element={<ComposeEmailPage />} />
      <Route path="campaigns" element={<CampaignListPage />} />
      <Route path="campaign-editor" element={<CampaignEditorPage />} />
      <Route path="event-triggers" element={<EventTriggersPage />} />
      <Route path="send-log" element={<EmailSendLogPage />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  )
}
