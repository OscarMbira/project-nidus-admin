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
      <Route path="*" element={<Navigate to="documentation-c-m-s" replace />} />
    </Routes>
  )
}
