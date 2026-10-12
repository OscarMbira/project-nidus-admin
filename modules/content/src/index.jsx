import { Routes, Route, Navigate } from 'react-router-dom'
import DocumentationCMSPage from './pages/DocumentationCMSPage.jsx'
import HelpManagementPage from './pages/HelpManagementPage.jsx'
import PWASettingsPage from './pages/PWASettingsPage.jsx'
import RoleMenuConfigPage from './pages/RoleMenuConfigPage.jsx'
import EmailTemplateListPage from './pages/EmailTemplateListPage.jsx'
import EmailTemplateEditorPage from './pages/EmailTemplateEditorPage.jsx'
import EmailSendLogPage from './pages/EmailSendLogPage.jsx'
import LanguageListPage from './pages/LanguageListPage.jsx'
import TranslationEditorPage from './pages/TranslationEditorPage.jsx'
import GlobalTemplateLibraryList from './pages/GlobalTemplateLibraryList.jsx'
import GlobalTemplateLibraryForm from './pages/GlobalTemplateLibraryForm.jsx'
import GlobalTemplateLibraryDetail from './pages/GlobalTemplateLibraryDetail.jsx'
import LegacyGlobalTemplateUpload from './pages/LegacyGlobalTemplateUpload.jsx'
import DefaultContentLibraryPage from './pages/DefaultContentLibraryPage.jsx'
import PublicSiteProductsPage from './pages/PublicSiteProductsPage.jsx'
import PublicSiteProductFormPage from './pages/PublicSiteProductFormPage.jsx'
import PublicSiteContentFormPage from './pages/PublicSiteContentFormPage.jsx'
import PublicSitePagesPage from './pages/PublicSitePagesPage.jsx'
import PublicSitePageFormPage from './pages/PublicSitePageFormPage.jsx'
import PublicSiteLinkFormPage from './pages/PublicSiteLinkFormPage.jsx'
import SiteEnquiriesPage from './pages/SiteEnquiriesPage.jsx'
import SiteEnquiryDetailPage from './pages/SiteEnquiryDetailPage.jsx'
import SiteHeadersPage from './pages/SiteHeadersPage.jsx'
import SiteHeaderFormPage from './pages/SiteHeaderFormPage.jsx'
import SiteSectionsPage from './pages/SiteSectionsPage.jsx'
import SiteSectionFormPage from './pages/SiteSectionFormPage.jsx'
import BlogPostsPage from './pages/BlogPostsPage.jsx'
import BlogPostFormPage from './pages/BlogPostFormPage.jsx'
import BlogCategoriesPage from './pages/BlogCategoriesPage.jsx'

export default function ContentRoutes() {
  return (
    <Routes>
      <Route path="documentation-c-m-s" element={<DocumentationCMSPage />} />
      <Route path="help-management" element={<HelpManagementPage />} />
      <Route path="p-w-a-settings" element={<PWASettingsPage />} />
      <Route path="role-menu-config" element={<RoleMenuConfigPage />} />
      <Route path="email-templates" element={<EmailTemplateListPage />} />
      <Route path="email-template-editor" element={<EmailTemplateEditorPage />} />
      <Route path="email-send-log" element={<EmailSendLogPage />} />
      <Route path="languages" element={<LanguageListPage />} />
      <Route path="translations" element={<TranslationEditorPage />} />
      <Route path="global-template-library" element={<GlobalTemplateLibraryList />} />
      <Route path="global-template-form" element={<GlobalTemplateLibraryForm />} />
      <Route path="global-template-detail" element={<GlobalTemplateLibraryDetail />} />
      <Route path="legacy-template-upload" element={<LegacyGlobalTemplateUpload />} />
      <Route path="default-content-library" element={<DefaultContentLibraryPage />} />
      <Route path="public-site" element={<PublicSiteProductsPage />} />
      <Route path="public-site-product" element={<PublicSiteProductFormPage />} />
      <Route path="public-site-content" element={<PublicSiteContentFormPage />} />
      <Route path="public-site-pages" element={<PublicSitePagesPage />} />
      <Route path="public-site-page" element={<PublicSitePageFormPage />} />
      <Route path="public-site-link" element={<PublicSiteLinkFormPage />} />
      <Route path="site-enquiries" element={<SiteEnquiriesPage />} />
      <Route path="site-enquiry" element={<SiteEnquiryDetailPage />} />
      <Route path="site-headers" element={<SiteHeadersPage />} />
      <Route path="site-header" element={<SiteHeaderFormPage />} />
      <Route path="site-sections" element={<SiteSectionsPage />} />
      <Route path="site-section" element={<SiteSectionFormPage />} />
      <Route path="blog-posts" element={<BlogPostsPage />} />
      <Route path="blog-post" element={<BlogPostFormPage />} />
      <Route path="blog-categories" element={<BlogCategoriesPage />} />
      <Route path="*" element={<Navigate to="documentation-c-m-s" replace />} />
    </Routes>
  )
}
