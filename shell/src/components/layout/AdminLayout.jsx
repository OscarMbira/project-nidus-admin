import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import AdminSidebar from './AdminSidebar.jsx'
import AdminHeader from './AdminHeader.jsx'

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950">
      <AdminHeader
        sidebarCollapsed={collapsed}
        onToggleSidebar={() => setCollapsed((current) => !current)}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AdminSidebar collapsed={collapsed} />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
