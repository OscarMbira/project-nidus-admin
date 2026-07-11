import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

export default function PopoutShell() {
  useEffect(() => {
    document.title = 'Detached — Nidus Admin'
  }, [])

  return (
    <div className="h-screen overflow-auto bg-gray-950">
      <Outlet />
    </div>
  )
}
