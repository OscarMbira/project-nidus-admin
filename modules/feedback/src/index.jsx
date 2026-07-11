import { Routes, Route, Navigate } from 'react-router-dom'
import BugTrackingPage from './pages/BugTrackingPage.jsx'
import FeatureRequestsPage from './pages/FeatureRequestsPage.jsx'
import FeedbackAnalysisPage from './pages/FeedbackAnalysisPage.jsx'
import ImprovementBacklogPage from './pages/ImprovementBacklogPage.jsx'

export default function FeedbackRoutes() {
  return (
    <Routes>
      <Route path="bug-tracking" element={<BugTrackingPage />} />
      <Route path="feature-requests" element={<FeatureRequestsPage />} />
      <Route path="feedback-analysis" element={<FeedbackAnalysisPage />} />
      <Route path="improvement-backlog" element={<ImprovementBacklogPage />} />
      <Route path="*" element={<Navigate to="bug-tracking" replace />} />
    </Routes>
  )
}
