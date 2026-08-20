import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IMPORT_SCHEMAS,
  completeBatchJob,
  createBatchJob,
  executeBulkOperation,
  fetchBatchJobDetail,
  generateErrorReport,
  getAdminDb,
  getPublicDb,
  getSimDb,
  inviteAdminUser,
  parseCSV,
  updateBatchJobItem,
  useDisplayId,
  validateImportRows,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminTable,
  EmptyState,
  ProgressIndicator,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const STEPS = ['Select Table', 'Upload CSV', 'Validate', 'Commit', 'Results']

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function getTableClient(tableRef) {
  const [schemaName] = String(tableRef || '').split('.')
  if (schemaName === 'public') return getPublicDb()
  if (schemaName === 'sim') return getSimDb()
  return getAdminDb()
}

function rowLabel(row, schema) {
  const primary = schema?.fields?.[0]?.key
  return row[primary] || `Row ${row.__rowNumber}`
}

async function importRow(row, schema, jobId, itemId, dryRun) {
  if (dryRun) return {}
  try {
    if (schema.rpc === 'invite_admin_user') {
      const { error } = await inviteAdminUser(row.email, row.role, null)
      if (error) throw new Error(error)
    } else if (schema.table) {
      const [, tableName] = schema.table.split('.')
      const db = getTableClient(schema.table)
      if (!db) throw new Error('Database not configured')
      const payload = {}
      schema.fields.forEach((field) => {
        if (row[field.key] != null && row[field.key] !== '') payload[field.key] = row[field.key]
      })
      const { error } = await db.from(tableName).insert(payload)
      if (error) throw new Error(error.message)
    } else {
      throw new Error('No import handler configured for this schema')
    }
    if (jobId && itemId) await updateBatchJobItem(jobId, itemId, 'succeeded')
    return {}
  } catch (err) {
    const message = err?.message || String(err)
    if (jobId && itemId) await updateBatchJobItem(jobId, itemId, 'failed', message)
    return { error: message }
  }
}

export default function BatchImportPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const fileInputRef = useRef(null)
  const [step, setStep] = useState(0)
  const [schemaKey, setSchemaKey] = useState('')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [parseResult, setParseResult] = useState(null)
  const [validation, setValidation] = useState(null)
  const [dryRun, setDryRun] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [results, setResults] = useState(null)
  const [jobId, setJobId] = useState(null)
  const { displayId: resultsJobDisplayId } = useDisplayId('admin.batch_jobs', results?.jobId || null)

  const schema = schemaKey ? IMPORT_SCHEMAS[schemaKey] : null
  const schemaOptions = useMemo(
    () => Object.entries(IMPORT_SCHEMAS).map(([key, value]) => ({ key, label: value.label || key })),
    [],
  )

  const previewRows = useMemo(() => {
    if (!validation) return []
    return [
      ...validation.valid.map((row) => ({ ...row, __validation: 'valid' })),
      ...validation.invalid.map(({ row, errors }) => ({ ...row, __validation: 'invalid', __errors: errors })),
    ].sort((a, b) => (a.__rowNumber || 0) - (b.__rowNumber || 0))
  }, [validation])

  const previewColumns = useMemo(() => {
    if (!schema) return []
    const cols = schema.fields.map((field) => ({
      key: field.key,
      label: field.label,
      render: (row) => row[field.key] || '—',
    }))
    cols.push({
      key: '__validation',
      label: 'Validation',
      sortable: false,
      render: (row) => (
        row.__validation === 'valid'
          ? <AdminBadge label="valid" variant="active" />
          : (
            <span className="text-red-300" title={(row.__errors || []).join('; ')}>
              invalid
            </span>
          )
      ),
    })
    return cols
  }, [schema])

  const handleFile = async (file) => {
    if (!file) return
    const text = await file.text()
    setCsvText(text)
    setFileName(file.name)
    const parsed = parseCSV(text)
    setParseResult(parsed)
    if (parsed.errors?.length) {
      showError(parsed.errors.join('; '))
    }
  }

  const runValidation = () => {
    if (!schema || !parseResult?.rows?.length) {
      showError('Upload a CSV file before validating.')
      return
    }
    const outcome = validateImportRows(parseResult.rows, schema)
    setValidation(outcome)
    setStep(2)
  }

  const handleCommit = async () => {
    if (!schema || !validation?.valid?.length) {
      showError('No valid rows to import.')
      return
    }
    setCommitting(true)
    setStep(3)
    setProgress({ current: 0, total: validation.valid.length })

    const validRows = validation.valid
    const recordIds = validRows.map((row) => String(row.__rowNumber))
    const recordLabels = validRows.map((row) => rowLabel(row, schema))

    let activeJobId = null
    let detailItems = []

    if (!dryRun) {
      const { data: createdJobId, error: createError } = await createBatchJob(
        `csv_import_${schemaKey.replace(/\./g, '_')}`,
        { schemaKey, table: schema.table, dryRun: false, schema, rows: validRows },
        recordIds,
        recordLabels,
      )
      if (createError) {
        setCommitting(false)
        showError(toErrorMessage(createError, 'Failed to create batch job.'))
        return
      }
      activeJobId = createdJobId
      setJobId(createdJobId)
      const { data: detail, error: detailError } = await fetchBatchJobDetail(createdJobId)
      if (detailError) {
        setCommitting(false)
        showError(toErrorMessage(detailError, 'Failed to load batch job items.'))
        return
      }
      detailItems = detail?.items || []
    }

    const outcome = await executeBulkOperation({
      items: validRows,
      operation: async (row, index) => {
        const itemId = detailItems[index]?.id
        return importRow(row, schema, activeJobId, itemId, dryRun)
      },
      onProgress: ({ current, total }) => setProgress({ current, total }),
    })

    if (activeJobId) await completeBatchJob(activeJobId)

    const combinedInvalid = [
      ...(validation.invalid || []),
      ...outcome.errors.map(({ item, error }) => ({
        row: item,
        errors: [error],
      })),
    ]

    setResults({
      succeeded: outcome.succeeded.length,
      failed: outcome.failed.length + (validation.invalid?.length || 0),
      skipped: 0,
      dryRun,
      invalidRows: combinedInvalid,
      jobId: activeJobId,
    })
    setCommitting(false)
    setStep(4)
    showSuccess(dryRun ? 'Dry run completed — no records were written.' : 'Import completed.')
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Data Import</h1>
        <p className="text-sm text-gray-500">Import CSV data into platform tables with validation and batch job tracking.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <div
            key={label}
            className={`rounded-full px-3 py-1 text-xs ${
              index === step
                ? 'bg-blue-900/50 text-blue-200 ring-1 ring-blue-700'
                : index < step
                  ? 'bg-gray-800 text-gray-300'
                  : 'bg-gray-900 text-gray-500'
            }`}
          >
            {index + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="max-w-xl space-y-4 rounded-lg border border-gray-700 bg-gray-900 p-6">
          <label className="block text-sm text-gray-300">
            <span className="mb-2 block text-xs uppercase tracking-wide text-gray-400">Target table</span>
            <select
              className={inputClass}
              value={schemaKey}
              onChange={(e) => setSchemaKey(e.target.value)}
            >
              <option value="">Select a table...</option>
              {schemaOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
          {schema && (
            <div className="rounded border border-gray-800 bg-gray-950 p-3 text-sm text-gray-400">
              <p className="font-medium text-gray-200">{schema.label}</p>
              <p className="mt-1">Mode: {schema.mode?.replace(/_/g, ' ')}</p>
              <ul className="mt-2 list-inside list-disc text-xs">
                {schema.fields.map((field) => (
                  <li key={field.key}>
                    {field.label}{field.required ? ' (required)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            disabled={!schemaKey}
            onClick={() => setStep(1)}
            className="rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="max-w-2xl space-y-4 rounded-lg border border-gray-700 bg-gray-900 p-6">
          <div
            className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-600 bg-gray-950 p-6 text-center hover:border-blue-600"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFile(e.dataTransfer.files?.[0])
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <p className="text-sm text-gray-300">Drag and drop a CSV file here, or click to browse</p>
            <p className="mt-1 text-xs text-gray-500">Headers must match schema field keys</p>
            {fileName && <p className="mt-3 text-sm text-blue-300">{fileName}</p>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {parseResult && (
            <p className="text-sm text-gray-400">
              Parsed {parseResult.rows?.length || 0} row(s)
              {parseResult.errors?.length ? ` · ${parseResult.errors.length} parse warning(s)` : ''}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(0)} className="rounded px-3 py-2 text-sm text-gray-400">Back</button>
            <button
              type="button"
              disabled={!parseResult?.rows?.length}
              onClick={runValidation}
              className="rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
            >
              Validate
            </button>
          </div>
        </div>
      )}

      {step === 2 && validation && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-400">
              {validation.valid.length} valid · {validation.invalid.length} invalid · {previewRows.length} total
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry run (validate only, no writes on commit)
            </label>
          </div>
          {!previewRows.length ? (
            <EmptyState title="No rows to preview" description="Upload and validate a CSV file first." />
          ) : (
            <AdminTable columns={previewColumns} rows={previewRows} pageSize={20} />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="rounded px-3 py-2 text-sm text-gray-400">Back</button>
            <button
              type="button"
              disabled={!validation.valid.length}
              onClick={handleCommit}
              className="rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {dryRun ? 'Run Dry Run' : 'Commit Import'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-xl space-y-4 rounded-lg border border-gray-700 bg-gray-900 p-6">
          <p className="text-sm text-gray-300">
            {dryRun ? 'Running dry-run validation...' : 'Committing import and updating batch job...'}
          </p>
          <ProgressIndicator label="Processing rows" current={progress.current} total={progress.total} />
        </div>
      )}

      {step === 4 && results && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-green-800 bg-green-950/30 p-4">
              <p className="text-xs uppercase text-green-400">Succeeded</p>
              <p className="mt-1 text-2xl font-semibold text-green-200">{results.succeeded}</p>
            </div>
            <div className="rounded-lg border border-red-800 bg-red-950/30 p-4">
              <p className="text-xs uppercase text-red-400">Failed</p>
              <p className="mt-1 text-2xl font-semibold text-red-200">{results.failed}</p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <p className="text-xs uppercase text-gray-400">Mode</p>
              <p className="mt-1 text-2xl font-semibold text-gray-200">{results.dryRun ? 'Dry Run' : 'Live'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {results.invalidRows?.length > 0 && (
              <button
                type="button"
                onClick={() => generateErrorReport(results.invalidRows)}
                className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
              >
                Download Error Report
              </button>
            )}
            {results.jobId && (
              <button
                type="button"
                onClick={() => navigate(`/batch-ops/batch-job-detail?id=${encodeURIComponent(resultsJobDisplayId || results.jobId)}`)}
                className="rounded border border-blue-700 bg-blue-900/30 px-3 py-2 text-sm text-blue-200 hover:bg-blue-900/50"
              >
                View Batch Job
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStep(0)
                setSchemaKey('')
                setCsvText('')
                setFileName('')
                setParseResult(null)
                setValidation(null)
                setResults(null)
                setJobId(null)
                setDryRun(true)
              }}
              className="rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-600"
            >
              Start New Import
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
