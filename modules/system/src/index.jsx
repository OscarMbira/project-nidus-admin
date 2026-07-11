import { Routes, Route, Navigate } from 'react-router-dom'
import SystemSettingsPage from './pages/SystemSettingsPage.jsx'
import FeatureFlagsPage from './pages/FeatureFlagsPage.jsx'
import MaintenanceModePage from './pages/MaintenanceModePage.jsx'
import SystemHealthPage from './pages/SystemHealthPage.jsx'
import CurrencyListPage from './pages/CurrencyListPage.jsx'
import ExchangeRateListPage from './pages/ExchangeRateListPage.jsx'
import CountryListPage from './pages/CountryListPage.jsx'
import IDGenerationRulesPage from './pages/IDGenerationRulesPage.jsx'
import IDGenerationRuleFormPage from './pages/IDGenerationRuleFormPage.jsx'
import GeneratedIDsPage from './pages/GeneratedIDsPage.jsx'
import NotificationTemplatesPage from './pages/NotificationTemplatesPage.jsx'
import AlertRulesPage from './pages/AlertRulesPage.jsx'
import TestDashboardPage from './pages/TestDashboardPage.jsx'
import TestSuiteDetailPage from './pages/TestSuiteDetailPage.jsx'
import TestRunDetailPage from './pages/TestRunDetailPage.jsx'
import TestResultDetailPage from './pages/TestResultDetailPage.jsx'
import TestFixPatternsPage from './pages/TestFixPatternsPage.jsx'
import EmailProviderConfigPage from './pages/EmailProviderConfigPage.jsx'

export default function SystemRoutes() {
  return (
    <Routes>
      <Route path="system-settings" element={<SystemSettingsPage />} />
      <Route path="feature-flags" element={<FeatureFlagsPage />} />
      <Route path="maintenance-mode" element={<MaintenanceModePage />} />
      <Route path="system-health" element={<SystemHealthPage />} />
      <Route path="currencies" element={<CurrencyListPage />} />
      <Route path="exchange-rates" element={<ExchangeRateListPage />} />
      <Route path="countries" element={<CountryListPage />} />
      <Route path="id-generation-rules" element={<IDGenerationRulesPage />} />
      <Route path="id-generation-rule-form" element={<IDGenerationRuleFormPage />} />
      <Route path="id-generated-list" element={<GeneratedIDsPage />} />
      <Route path="notification-templates" element={<NotificationTemplatesPage />} />
      <Route path="alert-rules" element={<AlertRulesPage />} />
      <Route path="test-dashboard" element={<TestDashboardPage />} />
      <Route path="test-suite-detail" element={<TestSuiteDetailPage />} />
      <Route path="test-run-detail" element={<TestRunDetailPage />} />
      <Route path="test-result-detail" element={<TestResultDetailPage />} />
      <Route path="test-fix-patterns" element={<TestFixPatternsPage />} />
      <Route path="email-provider" element={<EmailProviderConfigPage />} />
      <Route path="*" element={<Navigate to="system-settings" replace />} />
    </Routes>
  )
}
