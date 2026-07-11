const PLATFORM_URL = (import.meta.env.VITE_PLATFORM_APP_URL || 'http://localhost:5173').replace(/\/$/, '')
const SIMULATOR_URL = (import.meta.env.VITE_SIMULATOR_APP_URL || 'http://localhost:5174').replace(/\/$/, '')

export function getPlatformAppBaseUrl() {
  return PLATFORM_URL
}

export function getSimulatorAppBaseUrl() {
  return SIMULATOR_URL
}

/** User-facing affiliate application landing page (Platform or Simulator). */
export function getAffiliateApplyPageUrl(targetSystem = 'platform') {
  if (targetSystem === 'simulator') {
    return `${SIMULATOR_URL}/simulator/affiliate`
  }
  return `${PLATFORM_URL}/platform/affiliate`
}
