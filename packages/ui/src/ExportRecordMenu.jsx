/**
 * ExportRecordMenu — two-step export for form_template records:
 * 1) data mode (Plain / Sample / Real submission)
 * 2) format (PDF, Word, Excel, PPT, CSV, XML, JSON, Print)
 * Theme-aware; visually consistent with ExportListMenu.
 */

import { useState } from 'react'
import {
  Download,
  ChevronDown,
  ChevronLeft,
  FileText,
  Presentation,
  Table2,
  FileSpreadsheet,
  Code,
  Braces,
  Printer,
  FileDown,
} from 'lucide-react'
import {
  exportRecordToExcel,
  exportRecordToWord,
  exportRecordToPPT,
  exportRecordToCSV,
  exportRecordToXML,
  exportRecordToJSON,
  exportRecordToPrint,
  exportRecordToPDF,
  schemaToExportSections,
  buildSampleRecord,
  buildBlankRecord,
  PLAIN_TEMPLATE_BLANK,
  buildFormTemplateExportFilename,
  fetchCompletedFormInstances,
  fetchCompletedFormInstanceData,
} from '@nidus-admin/shared'

const DATA_MODES = [
  { id: 'plain', label: 'Plain Template', description: 'Blank fillable form structure' },
  { id: 'sample', label: 'Completed (Sample data)', description: 'Uses per-field Sample values' },
  {
    id: 'real',
    label: 'Completed (Real submission)',
    description: 'Pick a submitted form from Platform or Simulator',
  },
]

const FORMATS = [
  { id: 'pdf', label: 'PDF', icon: FileDown, iconClass: 'text-red-600' },
  { id: 'word', label: 'Word', icon: FileText, iconClass: 'text-blue-600' },
  { id: 'excel', label: 'Excel', icon: Table2, iconClass: 'text-green-600' },
  { id: 'ppt', label: 'PowerPoint', icon: Presentation, iconClass: 'text-amber-600' },
  { id: 'csv', label: 'CSV', icon: FileSpreadsheet, iconClass: 'text-emerald-600' },
  { id: 'xml', label: 'XML', icon: Code, iconClass: 'text-orange-600' },
  { id: 'json', label: 'JSON', icon: Braces, iconClass: 'text-yellow-600' },
  { id: 'print', label: 'Print', icon: Printer, iconClass: 'text-slate-600' },
]

async function runExport(format, sections, record, baseFilename, branding, blankPlaceholder) {
  switch (format) {
    case 'pdf':
      exportRecordToPDF(sections, record, baseFilename, branding, blankPlaceholder)
      break
    case 'word':
      await exportRecordToWord(sections, record, baseFilename, branding, blankPlaceholder)
      break
    case 'excel':
      await exportRecordToExcel(sections, record, baseFilename, branding, blankPlaceholder)
      break
    case 'ppt':
      exportRecordToPPT(sections, record, baseFilename, branding, blankPlaceholder)
      break
    case 'csv':
      exportRecordToCSV(sections, record, baseFilename, branding, blankPlaceholder)
      break
    case 'xml':
      exportRecordToXML(sections, record, baseFilename, branding, blankPlaceholder)
      break
    case 'json':
      exportRecordToJSON(sections, record, baseFilename, branding, blankPlaceholder)
      break
    case 'print':
      exportRecordToPrint(sections, record, baseFilename, branding, blankPlaceholder)
      break
    default:
      break
  }
}

export default function ExportRecordMenu({
  schema,
  templateName = 'Form Template',
  templateCode = '',
  globalTemplateId = null,
  branding = null,
  disabled = false,
  enableRealSubmission = true,
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('mode') // mode | format | picker
  const [mode, setMode] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [pickerTarget, setPickerTarget] = useState('platform')
  const [instances, setInstances] = useState([])
  const [instancesLoading, setInstancesLoading] = useState(false)
  const [instancesError, setInstancesError] = useState('')
  const [selectedInstanceId, setSelectedInstanceId] = useState(null)
  const [pendingFormat, setPendingFormat] = useState(null)

  const sectionsForMode = (exportMode) =>
    schemaToExportSections(schema, { includeExamples: exportMode === 'plain' })
  const baseFilename = buildFormTemplateExportFilename({ templateCode, templateName })
  const canExport = schemaToExportSections(schema).length > 0

  const resetMenu = () => {
    setOpen(false)
    setStep('mode')
    setMode(null)
    setPendingFormat(null)
    setSelectedInstanceId(null)
    setInstancesError('')
  }

  const loadInstances = async (target) => {
    if (!globalTemplateId) {
      setInstancesError('Missing global template id.')
      return
    }
    setInstancesLoading(true)
    setInstancesError('')
    setSelectedInstanceId(null)
    const { data, error } = await fetchCompletedFormInstances(globalTemplateId, target)
    setInstancesLoading(false)
    if (error) {
      setInstances([])
      setInstancesError(typeof error === 'string' ? error : 'Failed to load submissions.')
      return
    }
    setInstances(Array.isArray(data) ? data : [])
  }

  const chooseMode = (nextMode) => {
    setMode(nextMode)
    if (nextMode === 'real') {
      setStep('picker')
      setPickerTarget('platform')
      loadInstances('platform')
      return
    }
    setStep('format')
  }

  const exportWithRecord = async (format, exportMode, record, blankPlaceholder = '—') => {
    setExporting(true)
    try {
      await runExport(
        format,
        sectionsForMode(exportMode),
        record,
        baseFilename,
        branding,
        blankPlaceholder,
      )
      resetMenu()
    } finally {
      setExporting(false)
    }
  }

  const handleFormat = async (format) => {
    if (!canExport || exporting) return
    if (mode === 'plain') {
      await exportWithRecord(format, 'plain', buildBlankRecord(schema), PLAIN_TEMPLATE_BLANK)
      return
    }
    if (mode === 'sample') {
      await exportWithRecord(format, 'sample', buildSampleRecord(schema), '—')
      return
    }
    if (mode === 'real') {
      if (!selectedInstanceId) {
        setPendingFormat(format)
        setStep('picker')
        return
      }
      setExporting(true)
      try {
        const { data, error } = await fetchCompletedFormInstanceData(selectedInstanceId, pickerTarget)
        if (error || !data) {
          setInstancesError(typeof error === 'string' ? error : 'Failed to load submission data.')
          return
        }
        const values = data.values && typeof data.values === 'object' ? data.values : {}
        await runExport(format, sectionsForMode('real'), values, baseFilename, branding, '—')
        resetMenu()
      } finally {
        setExporting(false)
      }
    }
  }

  const btnBase =
    'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          if (open) resetMenu()
          else {
            setOpen(true)
            setStep('mode')
            setMode(null)
          }
        }}
        disabled={disabled || !canExport}
        className={btnBase}
        aria-haspopup="true"
        aria-expanded={open}
        title={!canExport ? 'Add sections and fields before exporting' : 'Export form template'}
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={resetMenu} aria-hidden="true" />
          <div className="absolute right-0 mt-1 py-1 min-w-[260px] max-w-[320px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg z-20">
            {step === 'mode' && (
              <>
                <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                  Choose data mode
                </p>
                {DATA_MODES.map((m) => {
                  const isReal = m.id === 'real'
                  const realDisabled = isReal && (!enableRealSubmission || !globalTemplateId)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={realDisabled}
                      onClick={() => chooseMode(m.id)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="block text-sm text-gray-800 dark:text-gray-100">{m.label}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {realDisabled
                          ? 'Requires export_completed permission / template id'
                          : m.description}
                      </span>
                    </button>
                  )
                })}
              </>
            )}

            {step === 'format' && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(mode === 'real' ? 'picker' : 'mode')}
                  className="w-full flex items-center gap-1 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {mode === 'plain' && 'Plain Template'}
                  {mode === 'sample' && 'Completed (Sample)'}
                  {mode === 'real' && 'Back to submission'}
                </button>
                {FORMATS.map(({ id, label, icon: Icon, iconClass }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={exporting}
                    onClick={() => handleFormat(id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    <Icon className={`w-4 h-4 ${iconClass}`} />
                    {exporting ? 'Exporting…' : label}
                  </button>
                ))}
              </>
            )}

            {step === 'picker' && (
              <div className="max-h-[360px] flex flex-col">
                <button
                  type="button"
                  onClick={() => setStep('mode')}
                  className="w-full flex items-center gap-1 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to data mode
                </button>
                <div className="px-3 py-2 flex gap-2 border-b border-gray-200 dark:border-gray-600">
                  {['platform', 'simulator'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setPickerTarget(t)
                        loadInstances(t)
                      }}
                      className={`flex-1 rounded px-2 py-1 text-xs capitalize ${
                        pickerTarget === t
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1">
                  {instancesLoading && (
                    <p className="px-1 py-2 text-xs text-gray-500 dark:text-gray-400">Loading submissions…</p>
                  )}
                  {instancesError && (
                    <p className="px-1 py-2 text-xs text-red-600 dark:text-red-400">{instancesError}</p>
                  )}
                  {!instancesLoading && !instancesError && instances.length === 0 && (
                    <p className="px-1 py-2 text-xs text-gray-500 dark:text-gray-400">
                      No submitted forms found for this template on {pickerTarget}.
                    </p>
                  )}
                  {instances.map((row) => {
                    const id = row.form_instance_id || row.id
                    const selected = selectedInstanceId === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedInstanceId(id)}
                        className={`w-full rounded px-2 py-2 text-left text-xs border ${
                          selected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                            : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span className="block font-medium text-gray-800 dark:text-gray-100">
                          {row.project_name || row.project_id || 'Project'}
                        </span>
                        <span className="block text-gray-500 dark:text-gray-400">
                          {row.status || '—'}
                          {row.owner_name ? ` · ${row.owner_name}` : ''}
                          {row.updated_at ? ` · ${new Date(row.updated_at).toLocaleString()}` : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 p-2">
                  <button
                    type="button"
                    disabled={!selectedInstanceId || exporting}
                    onClick={() => {
                      setStep('format')
                      if (pendingFormat) {
                        const fmt = pendingFormat
                        setPendingFormat(null)
                        handleFormat(fmt)
                      }
                    }}
                    className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {pendingFormat ? `Continue → ${pendingFormat.toUpperCase()}` : 'Choose format'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
