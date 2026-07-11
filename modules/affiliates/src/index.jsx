import { Routes, Route, Navigate } from 'react-router-dom'
import AffiliateDashboardPage from './pages/AffiliateDashboardPage.jsx'
import AffiliateListPage from './pages/AffiliateListPage.jsx'
import AffiliateDetailPage from './pages/AffiliateDetailPage.jsx'
import AffiliateFormPage from './pages/AffiliateFormPage.jsx'
import AffiliateCommissionsPage from './pages/AffiliateCommissionsPage.jsx'
import AffiliateApplicationsPage from './pages/AffiliateApplicationsPage.jsx'
import AffiliateLandingPreviewPage from './pages/AffiliateLandingPreviewPage.jsx'

export default function AffiliatesRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<AffiliateDashboardPage />} />
      <Route path="affiliate-list" element={<AffiliateListPage />} />
      <Route path="affiliate-detail" element={<AffiliateDetailPage />} />
      <Route path="affiliate-form" element={<AffiliateFormPage />} />
      <Route path="commissions" element={<AffiliateCommissionsPage />} />
      <Route path="applications" element={<AffiliateApplicationsPage />} />
      <Route path="apply-preview" element={<AffiliateLandingPreviewPage />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  )
}
