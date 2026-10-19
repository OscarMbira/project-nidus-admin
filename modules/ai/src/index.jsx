import { Routes, Route, Navigate } from 'react-router-dom'
import AiOverviewPage from './pages/AiOverviewPage.jsx'
import AiRunsPage from './pages/AiRunsPage.jsx'
import AiOrganisationsPage from './pages/AiOrganisationsPage.jsx'
import AiOrganisationPage from './pages/AiOrganisationPage.jsx'
import AiPlansPage from './pages/AiPlansPage.jsx'
import AiModelsPage from './pages/AiModelsPage.jsx'
import AiCataloguePage from './pages/AiCataloguePage.jsx'
import AiCatalogueEntityPage from './pages/AiCatalogueEntityPage.jsx'
import AiSettingsPage from './pages/AiSettingsPage.jsx'
import AiMeaningSearchPage from './pages/AiMeaningSearchPage.jsx'
import AiAssessorPage from './pages/AiAssessorPage.jsx'
import AiAssessorScenarioPage from './pages/AiAssessorScenarioPage.jsx'
import AiSimPersonasPage from './pages/AiSimPersonasPage.jsx'
import AiSimPersonaPage from './pages/AiSimPersonaPage.jsx'

// AI Centre (monorepo v1272, PRD D17) — AI Centre. Nav rows: SQL/v235.
export default function AiCentreRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="overview" replace />} />
      <Route path="overview" element={<AiOverviewPage />} />
      <Route path="runs" element={<AiRunsPage />} />
      <Route path="organisations" element={<AiOrganisationsPage />} />
      <Route path="organisation" element={<AiOrganisationPage />} />
      <Route path="plans" element={<AiPlansPage />} />
      <Route path="models" element={<AiModelsPage />} />
      <Route path="catalogue" element={<AiCataloguePage />} />
      <Route path="catalogue-entity" element={<AiCatalogueEntityPage />} />
      <Route path="meaning-search" element={<AiMeaningSearchPage />} />
      <Route path="assessor" element={<AiAssessorPage />} />
      <Route path="assessor-scenario" element={<AiAssessorScenarioPage />} />
      <Route path="sim-personas" element={<AiSimPersonasPage />} />
      <Route path="sim-persona" element={<AiSimPersonaPage />} />
      <Route path="settings" element={<AiSettingsPage />} />
      <Route path="*" element={<Navigate to="overview" replace />} />
    </Routes>
  )
}
