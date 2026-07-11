import { Routes, Route, Navigate } from 'react-router-dom'
import SupportTicketListPage from './pages/SupportTicketListPage.jsx'
import SupportTicketDetailPage from './pages/SupportTicketDetailPage.jsx'
import UserImpersonationPage from './pages/UserImpersonationPage.jsx'
import AnnouncementsPage from './pages/AnnouncementsPage.jsx'

export default function SupportRoutes() {
  return (
    <Routes>
      <Route path="support-ticket-list" element={<SupportTicketListPage />} />
      <Route path="support-ticket-detail" element={<SupportTicketDetailPage />} />
      <Route path="user-impersonation" element={<UserImpersonationPage />} />
      <Route path="announcements" element={<AnnouncementsPage />} />
      <Route path="*" element={<Navigate to="support-ticket-list" replace />} />
    </Routes>
  )
}
