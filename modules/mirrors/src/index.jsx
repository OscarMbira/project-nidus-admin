import { Routes, Route, Navigate } from 'react-router-dom'
import PlatformMirrorPage from './pages/PlatformMirrorPage.jsx'
import SimulatorMirrorPage from './pages/SimulatorMirrorPage.jsx'

export default function MirrorsRoutes() {
  return (
    <Routes>
      <Route path="platform-mirror" element={<PlatformMirrorPage />} />
      <Route path="simulator-mirror" element={<SimulatorMirrorPage />} />
      <Route path="*" element={<Navigate to="platform-mirror" replace />} />
    </Routes>
  )
}
