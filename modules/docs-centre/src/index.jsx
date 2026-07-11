import { Routes, Route, Navigate } from 'react-router-dom'
import DocsHomePage from './pages/DocsHomePage.jsx'
import ModuleDocsPage from './pages/ModuleDocsPage.jsx'
import DocsSearchPage from './pages/DocsSearchPage.jsx'
import DocsEditorPage from './pages/DocsEditorPage.jsx'

export default function DocsCentreRoutes() {
  return (
    <Routes>
      <Route index element={<DocsHomePage />} />
      <Route path="search" element={<DocsSearchPage />} />
      <Route path="editor" element={<DocsEditorPage />} />
      <Route path=":module" element={<ModuleDocsPage />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  )
}
