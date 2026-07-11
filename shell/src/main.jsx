import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installGlobalErrorHandlers } from '@nidus-admin/shared'
import App from './App.jsx'

globalThis.__NIDUS_ADMIN_SUPABASE__ = {
  url: import.meta.env.VITE_ADMIN_SUPABASE_URL || '',
  anonKey: import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY || '',
}

installGlobalErrorHandlers()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
