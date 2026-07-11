import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { LoadingState } from '@nidus-admin/ui'
import SubscriptionListPage from './pages/SubscriptionListPage.jsx'
import SubscriptionDetailPage from './pages/SubscriptionDetailPage.jsx'
import SubscriptionFormPage from './pages/SubscriptionFormPage.jsx'
import SubscriptionPreviewPage from './pages/SubscriptionPreviewPage.jsx'
import PricingPlansPage from './pages/PricingPlansPage.jsx'
import PaymentTransactionsPage from './pages/PaymentTransactionsPage.jsx'
import RevenueDashboardPage from './pages/RevenueDashboardPage.jsx'
import InvoiceListPage from './pages/InvoiceListPage.jsx'
import TaxRatesPage from './pages/TaxRatesPage.jsx'
import RefundListPage from './pages/RefundListPage.jsx'
import RefundDetailPage from './pages/RefundDetailPage.jsx'
import CancellationReasonsPage from './pages/CancellationReasonsPage.jsx'
import PaymentGatewayListPage from './pages/PaymentGatewayListPage.jsx'
import PaymentGatewayFormPage from './pages/PaymentGatewayFormPage.jsx'
import PaymentMethodListPage from './pages/PaymentMethodListPage.jsx'
import PaymentMethodFormPage from './pages/PaymentMethodFormPage.jsx'
import PaymentMethodRoutingPage from './pages/PaymentMethodRoutingPage.jsx'
const PaymentFlowPage = lazy(() => import('./pages/PaymentFlowPage.jsx'))
import PaymentMonitorPage from './pages/PaymentMonitorPage.jsx'
import PaymentReportsPage from './pages/PaymentReportsPage.jsx'
import PromoCodeListPage from './pages/PromoCodeListPage.jsx'
import PromoCodeFormPage from './pages/PromoCodeFormPage.jsx'
import PlanCatalogListPage from './pages/PlanCatalogListPage.jsx'
import PlanCatalogFormPage from './pages/PlanCatalogFormPage.jsx'
import PaymentRetryRulePage from './pages/PaymentRetryRulePage.jsx'
import SettlementAccountListPage from './pages/SettlementAccountListPage.jsx'
import SettlementAccountFormPage from './pages/SettlementAccountFormPage.jsx'
import SubscriptionSectionHistoryPage from './pages/SubscriptionSectionHistoryPage.jsx'
import SubscriptionAuditRecordPage from './pages/SubscriptionAuditRecordPage.jsx'
import SubscriptionPricingRecordPage from './pages/SubscriptionPricingRecordPage.jsx'

const PaymentDashboardPage = lazy(() => import('./pages/PaymentDashboardPage.jsx'))

export default function SubscriptionsRoutes() {
  return (
    <Routes>
      <Route path="subscription-list" element={<SubscriptionListPage />} />
      <Route path="subscription-preview" element={<SubscriptionPreviewPage />} />
      <Route path="subscription-detail" element={<SubscriptionDetailPage />} />
      <Route path="subscription-form" element={<SubscriptionFormPage />} />
      <Route path="pricing-plans" element={<PricingPlansPage />} />
      <Route path="payment-transactions" element={<PaymentTransactionsPage />} />
      <Route path="revenue-dashboard" element={<RevenueDashboardPage />} />
      <Route path="invoices" element={<InvoiceListPage />} />
      <Route path="tax-rates" element={<TaxRatesPage />} />
      <Route path="refunds" element={<RefundListPage />} />
      <Route path="refund-detail" element={<RefundDetailPage />} />
      <Route path="cancellation-reasons" element={<CancellationReasonsPage />} />
      <Route path="payment-gateways" element={<PaymentGatewayListPage />} />
      <Route path="payment-gateway-form" element={<PaymentGatewayFormPage />} />
      <Route path="payment-methods" element={<PaymentMethodListPage />} />
      <Route path="payment-method-form" element={<PaymentMethodFormPage />} />
      <Route path="payment-method-routing" element={<PaymentMethodRoutingPage />} />
      <Route path="payment-flow" element={<Suspense fallback={<LoadingState message="Loading payment flow..." />}><PaymentFlowPage /></Suspense>} />
      <Route path="payment-monitor" element={<PaymentMonitorPage />} />
      <Route path="payment-dashboard" element={<Suspense fallback={<LoadingState message="Loading payment dashboard..." />}><PaymentDashboardPage /></Suspense>} />
      <Route path="payment-reports" element={<PaymentReportsPage />} />
      <Route path="promo-codes" element={<PromoCodeListPage />} />
      <Route path="promo-code-form" element={<PromoCodeFormPage />} />
      <Route path="plan-catalog" element={<PlanCatalogListPage />} />
      <Route path="plan-catalog-form" element={<PlanCatalogFormPage />} />
      <Route path="payment-retry-rules" element={<PaymentRetryRulePage />} />
      <Route path="settlement-accounts" element={<SettlementAccountListPage />} />
      <Route path="settlement-account-form" element={<SettlementAccountFormPage />} />
      <Route path="subscription-change-history/record/:auditId" element={<SubscriptionAuditRecordPage sectionKey="subscription-change-history" />} />
      <Route path="pricing-preview-history/record/:auditId" element={<SubscriptionAuditRecordPage sectionKey="pricing-preview-history" />} />
      <Route path="pricing-preview-history/pricing/:pricingId" element={<SubscriptionPricingRecordPage sectionKey="pricing-preview-history" />} />
      <Route path="plan-catalog-history/record/:auditId" element={<SubscriptionAuditRecordPage sectionKey="plan-catalog-history" />} />
      <Route path="revenue-history/record/:auditId" element={<SubscriptionAuditRecordPage sectionKey="revenue-history" />} />
      <Route path="subscription-change-history" element={<SubscriptionSectionHistoryPage sectionKey="subscription-change-history" />} />
      <Route path="pricing-preview-history" element={<SubscriptionSectionHistoryPage sectionKey="pricing-preview-history" />} />
      <Route path="plan-catalog-history" element={<SubscriptionSectionHistoryPage sectionKey="plan-catalog-history" />} />
      <Route path="revenue-history" element={<SubscriptionSectionHistoryPage sectionKey="revenue-history" />} />
      <Route path="*" element={<Navigate to="subscription-list" replace />} />
    </Routes>
  )
}
