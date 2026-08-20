/**
 * ExportListMenu — Export list/table to Excel, Word, or PowerPoint.
 * Excel: exports all columns (one click).
 * Word / PowerPoint: open modal to choose fields (default 5, max 10).
 * Theme-aware (dark/light).
 */

import { useState, useMemo } from 'react'
import { Download, ChevronDown, FileText, Presentation, Table2, FileSpreadsheet, Code, Braces, Printer, FileDown } from 'lucide-react'
import {
  exportToExcel,
  exportListToWord,
  exportListToPPT,
  exportListToCSV,
  exportListToXML,
  exportListToJSON,
  exportListToPrint,
  exportListToPDF,
  DEFAULT_LIST_EXPORT_FIELDS,
  MAX_LIST_EXPORT_FIELDS,
} from '@nidus-admin/shared'
import { withExportRowNumbers } from '@nidus-admin/shared'

export default function ExportListMenu({
  columns = [],
  data = [],
  baseFilename = 'Export',
  disabled = false,
  includeRowNumbers = true,
  pagination = {},
}) {
  const [open, setOpen] = useState(false)
  const [fieldModal, setFieldModal] = useState(null) // 'word' | 'ppt' | null
  const [selectedKeys, setSelectedKeys] = useState(() => {
    const keys = (columns || []).map(c => c.key).filter(Boolean)
    return keys.slice(0, DEFAULT_LIST_EXPORT_FIELDS)
  })
  const [exporting, setExporting] = useState(false)

  const allKeys = useMemo(() => (columns || []).map(c => c.key).filter(Boolean), [columns])
  const selectedColumns = useMemo(
    () => (columns || []).filter(c => selectedKeys.includes(c.key)),
    [columns, selectedKeys]
  )

  const resolveExport = (cols, rows) =>
    withExportRowNumbers(cols, rows, { includeRowNumbers, ...pagination })

  const toggleKey = (key) => {
    setSelectedKeys(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key)
      if (prev.length >= MAX_LIST_EXPORT_FIELDS) return prev
      return [...prev, key]
    })
  }

  const handleExportWord = async () => {
    if (selectedColumns.length === 0) return
    setExporting(true)
    try {
      await exportListToWord(selectedColumns, data, baseFilename)
      setFieldModal(null)
    } finally {
      setExporting(false)
    }
  }

  const handleExportPPT = () => {
    if (selectedColumns.length === 0) return
    setExporting(true)
    try {
      exportListToPPT(selectedColumns, data, baseFilename)
      setFieldModal(null)
    } finally {
      setExporting(false)
    }
  }

  const openFieldModal = (type) => {
    setSelectedKeys(prev => {
      const keys = (columns || []).map(c => c.key).filter(Boolean)
      if (prev.length > 0) return prev.slice(0, MAX_LIST_EXPORT_FIELDS)
      return keys.slice(0, DEFAULT_LIST_EXPORT_FIELDS)
    })
    setFieldModal(type)
  }

  const btnBase = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'

  return (
    <>
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={disabled || !data.length}
          className={btnBase}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <Download className="w-4 h-4" />
          Export
          <ChevronDown className="w-4 h-4" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
            <div className="absolute right-0 mt-1 py-1 min-w-[180px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg z-20">
              {!data.length && (
                <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                  No data to export yet. Add records first.
                </p>
              )}
              <button
                type="button"
                onClick={async () => {
                  const { columns: c, rows: r } = resolveExport(columns, data)
                  await exportToExcel(c, r, baseFilename)
                  setOpen(false)
                }}
                disabled={!data.length}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Table2 className="w-4 h-4 text-green-600" /> Excel (all fields)
              </button>
              <button
                type="button"
                onClick={() => { openFieldModal('word'); setOpen(false) }}
                disabled={!data.length || !columns.length}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <FileText className="w-4 h-4 text-blue-600" /> Word (choose fields)
              </button>
              <button
                type="button"
                onClick={() => { openFieldModal('ppt'); setOpen(false) }}
                disabled={!data.length || !columns.length}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Presentation className="w-4 h-4 text-amber-600" /> PowerPoint (choose fields)
              </button>
              <button
                type="button"
                onClick={() => {
                  const { columns: c, rows: r } = resolveExport(columns, data)
                  exportListToCSV(c, r, baseFilename)
                  setOpen(false)
                }}
                disabled={!data.length}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  const { columns: c, rows: r } = resolveExport(columns, data)
                  exportListToXML(c, r, baseFilename)
                  setOpen(false)
                }}
                disabled={!data.length}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Code className="w-4 h-4 text-orange-600" /> XML
              </button>
              <button
                type="button"
                onClick={() => {
                  const { columns: c, rows: r } = resolveExport(columns, data)
                  exportListToJSON(c, r, baseFilename)
                  setOpen(false)
                }}
                disabled={!data.length}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Braces className="w-4 h-4 text-yellow-600" /> JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  const { columns: c, rows: r } = resolveExport(columns, data)
                  exportListToPDF(c, r, baseFilename)
                  setOpen(false)
                }}
                disabled={!data.length}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <FileDown className="w-4 h-4 text-red-600" /> PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  const { columns: c, rows: r } = resolveExport(columns, data)
                  exportListToPrint(c, r, baseFilename)
                  setOpen(false)
                }}
                disabled={!data.length}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Printer className="w-4 h-4 text-slate-600" /> Print
              </button>
            </div>
          </>
        )}
      </div>

      {/* Field selector modal for Word / PowerPoint */}
      {fieldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !exporting && setFieldModal(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Choose fields to export ({fieldModal === 'word' ? 'Word' : 'PowerPoint'})
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Select up to {MAX_LIST_EXPORT_FIELDS} fields (default {DEFAULT_LIST_EXPORT_FIELDS}).
              </p>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <ul className="space-y-2">
                {allKeys.map(key => {
                  const col = columns.find(c => c.key === key)
                  const label = col?.label || key
                  const checked = selectedKeys.includes(key)
                  const disabledCheck = !checked && selectedKeys.length >= MAX_LIST_EXPORT_FIELDS
                  return (
                    <li key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`field-${key}`}
                        checked={checked}
                        disabled={disabledCheck}
                        onChange={() => toggleKey(key)}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor={`field-${key}`} className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                        {label}
                      </label>
                    </li>
                  )
                })}
              </ul>
              {selectedKeys.length > 0 && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  {selectedKeys.length} of {MAX_LIST_EXPORT_FIELDS} max selected
                </p>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFieldModal(null)}
                disabled={exporting}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={fieldModal === 'word' ? handleExportWord : handleExportPPT}
                disabled={exporting || selectedColumns.length === 0}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : `Export to ${fieldModal === 'word' ? 'Word' : 'PowerPoint'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
