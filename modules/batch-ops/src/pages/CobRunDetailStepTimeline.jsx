import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDate } from '@nidus-admin/shared'
import { AdminBadge } from '@nidus-admin/ui'
import CobProcessedRecordsModal from './CobProcessedRecordsModal.jsx'
import { getStepRecordContext } from './cobStepRecords.js'

const STATUS_VARIANT = {
  pending: 'pending_activation',
  running: 'system_admin',
  completed: 'active',
  failed: 'suspended',
  skipped: 'content_admin',
  rolled_back: 'suspended',
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return `${minutes}m ${rem}s`
}

function jsonPreview(value) {
  if (!value) return '—'
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

function ProcessedRecordsLine({ step, onDrillDown }) {
  const context = getStepRecordContext(step)
  if (context.count == null && !context.records.length) return null

  const typeLabel = context.recordTypeLabel
  const count = context.count ?? context.records.length

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
        {typeLabel}
      </span>
      {context.hasDrillDown ? (
        <button
          type="button"
          onClick={() => onDrillDown(step, context)}
          className="text-xs text-blue-300 underline-offset-2 hover:text-blue-200 hover:underline"
        >
          {count} record(s) processed — view details
        </button>
      ) : (
        <span className="text-xs text-gray-400">{count} record(s) processed</span>
      )}
    </div>
  )
}

export default function StepTimeline({ steps }) {
  const navigate = useNavigate()
  const [modalStep, setModalStep] = useState(null)
  const [modalContext, setModalContext] = useState(null)

  const openDrillDown = (step, context) => {
    if (context.records.length) {
      setModalStep(step)
      setModalContext(context)
      return
    }
    if (context.listPath) {
      navigate(context.listPath)
    }
  }

  if (!steps?.length) {
    return <p className="text-sm text-gray-500">No steps recorded for this run.</p>
  }

  return (
    <>
      <ol className="relative space-y-0 border-l border-gray-700 pl-6">
        {steps.map((step, index) => {
          const isFailed = step.status === 'failed'
          const isComplete = step.status === 'completed'
          const isRunning = step.status === 'running'
          const dotColor = isFailed
            ? 'bg-red-500 ring-red-900'
            : isComplete
              ? 'bg-green-500 ring-green-900'
              : isRunning
                ? 'bg-blue-500 ring-blue-900 animate-pulse'
                : 'bg-gray-600 ring-gray-800'

          return (
            <li key={step.id || index} className="relative pb-8 last:pb-0">
              <span className={`absolute -left-[29px] mt-1.5 h-3 w-3 rounded-full ring-4 ${dotColor}`} />
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">Step {step.step_order ?? index + 1}</span>
                  <h3 className="font-medium text-gray-100">{step.process_name || 'Process'}</h3>
                  <AdminBadge
                    label={step.status}
                    variant={STATUS_VARIANT[step.status] || 'system_admin'}
                  />
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  <ProcessedRecordsLine step={step} onDrillDown={openDrillDown} />
                  <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                    {step.started_at && <span>Started {formatDate(step.started_at)}</span>}
                    {formatDuration(step.started_at, step.completed_at) && (
                      <span>Duration {formatDuration(step.started_at, step.completed_at)}</span>
                    )}
                  </div>
                </div>
                {step.error_message && (
                  <p className="mt-2 text-sm text-red-300">{step.error_message}</p>
                )}
                {step.result_summary && (
                  <pre className="mt-3 max-h-40 overflow-auto rounded border border-gray-800 bg-gray-950 p-2 text-xs text-gray-400">
                    {jsonPreview(step.result_summary)}
                  </pre>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <CobProcessedRecordsModal
        open={Boolean(modalStep)}
        onClose={() => {
          setModalStep(null)
          setModalContext(null)
        }}
        step={modalStep}
        context={modalContext}
      />
    </>
  )
}
