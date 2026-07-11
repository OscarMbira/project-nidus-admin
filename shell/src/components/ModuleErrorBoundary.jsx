import { Component } from 'react'
import { reportClientError } from '@nidus-admin/shared'
import { isModuleRemoteError } from '../utils/lazyRemote.js'
import { getModuleDevCommand } from '../config/moduleRegistry.js'

export class ModuleErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error(`Module ${this.props.module} failed:`, error, info)
    reportClientError({
      error,
      info,
      module: this.props.module,
      errorType: 'render_error',
      system: 'admin',
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      const remoteError = isModuleRemoteError(this.state.error)
      const devCommand = getModuleDevCommand(this.props.module)
      return (
        <div className="m-6 rounded-lg border border-gray-700 bg-gray-900 p-8 text-center">
          <p className="text-gray-300">This section is temporarily unavailable.</p>
          {import.meta.env.DEV && remoteError && (
            <p className="mt-3 text-sm text-amber-300">
              Federated module not reachable on its dev port.
              {devCommand ? (
                <>
                  {' '}Run{' '}
                  <code className="text-amber-200">{devCommand}</code>
                </>
              ) : (
                <>
                  {' '}Run <code className="text-amber-200">pnpm run dev:full</code> from the repo root.
                </>
              )}
              {' '}See <code className="text-amber-200">DEV_MODULES.md</code> for port mappings.
            </p>
          )}
          {import.meta.env.DEV && this.state.error && (
            <p className="mt-2 text-xs text-red-400">{this.state.error.message}</p>
          )}
          <button type="button" className="mt-4 text-sm text-blue-400 hover:underline" onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
