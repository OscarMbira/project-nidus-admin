import { useState } from 'react'
import {
  fetchRolePermissionsMatrix,
  runDiagnosticChecks,
  saveDiagnosticSession,
} from '@nidus-admin/shared'
import { LoadingState, useToast } from '@nidus-admin/ui'

const statusClass = { pass: 'text-emerald-400', warn: 'text-amber-400', fail: 'text-red-400' }

export default function DiagnosticsPage() {
  const { showSuccess, showError } = useToast()
  const [running, setRunning] = useState(false)
  const [checks, setChecks] = useState([])
  const [overall, setOverall] = useState(null)
  const [matrix, setMatrix] = useState(null)
  const [showMatrix, setShowMatrix] = useState(false)

  const run = async () => {
    setRunning(true)
    setChecks([])
    const result = await runDiagnosticChecks('local')
    setChecks(result.checks)
    setOverall(result.overall)
    const { error } = await saveDiagnosticSession(
      `Diagnostic ${new Date().toLocaleString()}`,
      result.checks,
      result.overall,
      'local',
    )
    setRunning(false)
    if (error) showError(error)
    else showSuccess('Diagnostic session saved.')
  }

  const loadMatrix = async () => {
    setShowMatrix(true)
    const { data } = await fetchRolePermissionsMatrix()
    setMatrix(data)
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-100">Diagnostic Centre</h1>
        <div className="flex gap-2">
          <button type="button" disabled={running} onClick={run} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {running ? 'Running…' : 'Run diagnostics'}
          </button>
          <button type="button" onClick={loadMatrix} className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-200">Permission matrix</button>
        </div>
      </div>

      {overall && <p className="text-sm">Overall: <span className={statusClass[overall]}>{overall}</span></p>}

      {running && <LoadingState message="Running health checks..." />}

      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.check_key} className="rounded border border-gray-700 bg-gray-900 p-3">
            <div className="flex justify-between gap-2">
              <span className="text-gray-200">{c.label}</span>
              <span className={`text-sm font-medium ${statusClass[c.status]}`}>{c.status}</span>
            </div>
            <p className="text-xs text-gray-500">{c.message} ({c.duration_ms}ms)</p>
          </li>
        ))}
      </ul>

      {showMatrix && matrix && (
        <div className="overflow-x-auto rounded border border-gray-700">
          <table className="min-w-full text-xs text-gray-300">
            <thead className="bg-gray-800">
              <tr>
                <th className="p-2 text-left">Permission</th>
                {['super_admin', 'system_admin', 'support_admin', 'content_admin'].map((r) => (
                  <th key={r} className="p-2">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(matrix.permissions || []).slice(0, 40).map((p) => (
                <tr key={p.permission_key} className="border-t border-gray-800">
                  <td className="p-2">{p.permission_key}</td>
                  {['super_admin', 'system_admin', 'support_admin', 'content_admin'].map((role) => (
                    <td key={role} className="p-2 text-center">
                      {(matrix.rolePermissions || []).some((rp) => rp.role === role && rp.permission_key === p.permission_key) ? '✓' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
