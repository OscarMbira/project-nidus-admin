import { Routes, Route, Navigate } from 'react-router-dom'
import SystemSettingsPage from './pages/SystemSettingsPage.jsx'
import FeatureFlagsPage from './pages/FeatureFlagsPage.jsx'
import PlannerMenuAvailabilityPage from './pages/PlannerMenuAvailabilityPage.jsx'
import MaintenanceModePage from './pages/MaintenanceModePage.jsx'
import SystemHealthPage from './pages/SystemHealthPage.jsx'
import CurrencyListPage from './pages/CurrencyListPage.jsx'
import ExchangeRateListPage from './pages/ExchangeRateListPage.jsx'
import CountryListPage from './pages/CountryListPage.jsx'
import IDGenerationRulesPage from './pages/IDGenerationRulesPage.jsx'
import IDGenerationRuleFormPage from './pages/IDGenerationRuleFormPage.jsx'
import GeneratedIDsPage from './pages/GeneratedIDsPage.jsx'
import IdToApplicationReportPage from './pages/IdToApplicationReportPage.jsx'
import NotificationTemplatesPage from './pages/NotificationTemplatesPage.jsx'
import NotificationTemplateFormPage from './pages/NotificationTemplateFormPage.jsx'
import AlertRulesPage from './pages/AlertRulesPage.jsx'
import AlertRuleFormPage from './pages/AlertRuleFormPage.jsx'
import TestDashboardPage from './pages/TestDashboardPage.jsx'
import TestSuiteDetailPage from './pages/TestSuiteDetailPage.jsx'
import TestRunDetailPage from './pages/TestRunDetailPage.jsx'
import TestResultDetailPage from './pages/TestResultDetailPage.jsx'
import TestFixPatternsPage from './pages/TestFixPatternsPage.jsx'
import EmailProviderConfigPage from './pages/EmailProviderConfigPage.jsx'
import ProfessionalRolesPage from './pages/ProfessionalRolesPage.jsx'
import ProfessionalRoleFormPage from './pages/ProfessionalRoleFormPage.jsx'
import IndustryCategoriesPage from './pages/IndustryCategoriesPage.jsx'
import IndustryCategoryFormPage from './pages/IndustryCategoryFormPage.jsx'
import IndustrySegmentsPage from './pages/IndustrySegmentsPage.jsx'
import IndustrySegmentFormPage from './pages/IndustrySegmentFormPage.jsx'
import IndustryPacksPage from './pages/IndustryPacksPage.jsx'
import IndustryPackFormPage from './pages/IndustryPackFormPage.jsx'

export default function SystemRoutes() {
  return (
    <Routes>
      <Route path="system-settings" element={<SystemSettingsPage />} />
      <Route path="feature-flags" element={<FeatureFlagsPage />} />
      <Route path="planner-menu" element={<PlannerMenuAvailabilityPage />} />
      <Route path="maintenance-mode" element={<MaintenanceModePage />} />
      <Route path="system-health" element={<SystemHealthPage />} />
      <Route path="currencies" element={<CurrencyListPage />} />
      <Route path="exchange-rates" element={<ExchangeRateListPage />} />
      <Route path="countries" element={<CountryListPage />} />
      <Route path="id-generation-rules" element={<IDGenerationRulesPage />} />
      <Route path="id-generation-rule-form" element={<IDGenerationRuleFormPage />} />
      <Route path="id-generated-list" element={<GeneratedIDsPage />} />
      <Route path="id-to-application-report" element={<IdToApplicationReportPage />} />
      <Route path="notification-templates" element={<NotificationTemplatesPage />} />
      <Route path="notification-template-form" element={<NotificationTemplateFormPage />} />
      <Route path="alert-rules" element={<AlertRulesPage />} />
      <Route path="alert-rule-form" element={<AlertRuleFormPage />} />
      <Route path="test-dashboard" element={<TestDashboardPage />} />
      <Route path="test-suite-detail" element={<TestSuiteDetailPage />} />
      <Route path="test-run-detail" element={<TestRunDetailPage />} />
      <Route path="test-result-detail" element={<TestResultDetailPage />} />
      <Route path="test-fix-patterns" element={<TestFixPatternsPage />} />
      <Route path="email-provider" element={<EmailProviderConfigPage />} />
      <Route path="professional-roles" element={<ProfessionalRolesPage />} />
      <Route path="professional-role-form" element={<ProfessionalRoleFormPage />} />
      <Route path="industry-categories" element={<IndustryCategoriesPage />} />
      <Route path="industry-category-form" element={<IndustryCategoryFormPage />} />
      <Route path="industry-segments" element={<IndustrySegmentsPage />} />
      <Route path="industry-segment-form" element={<IndustrySegmentFormPage />} />
      <Route path="industry-packs" element={<IndustryPacksPage />} />
      <Route path="industry-pack-form" element={<IndustryPackFormPage />} />
      <Route path="*" element={<Navigate to="system-settings" replace />} />
    </Routes>
  )
}
