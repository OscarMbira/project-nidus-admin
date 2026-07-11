import { useEffect, useState } from 'react'
import { LoadingState } from '@nidus-admin/ui'
import { getModuleDevCommand, getModuleLabel } from '../config/moduleRegistry.js'

export default function ModuleLoadingFallback({ module }) {
  const [showHint, setShowHint] = useState(false)
  const label = getModuleLabel(module)
  const devCommand = getModuleDevCommand(module)

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), 4000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <LoadingState message={`Loading ${label}…`} />
      {import.meta.env.DEV && showHint && (
        <div className="max-w-lg rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">Still loading?</p>
          <p className="mt-1 text-amber-100/90">
            The {label} module runs as a separate dev server. If you use the light dev set, start it with:
          </p>
          {devCommand ? (
            <code className="mt-2 block break-all rounded bg-gray-950 px-2 py-1.5 text-left text-xs text-amber-100">
              {devCommand}
            </code>
          ) : (
            <code className="mt-2 block rounded bg-gray-950 px-2 py-1.5 text-xs text-amber-100">
              pnpm run dev:full
            </code>
          )}
          <p className="mt-2 text-xs text-amber-200/80">See DEV_MODULES.md for port mappings.</p>
        </div>
      )}
    </div>
  )
}
