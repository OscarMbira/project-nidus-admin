/**
 * Unified Export Utilities
 * Excel (lists + record), Word, PowerPoint for list and record view pages.
 * Used by Platform and Simulator.
 * Excel: uses xlsx-js-style so we can set Wrap Text on cells with newlines (bullet lists).
 */

import pptxgen from 'pptxgenjs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } from 'docx'

const BRAND_FOOTER = 'Project Nidus Admin'

let xlsxModulePromise = null

async function getXLSX() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx-js-style').then((mod) => mod?.default ?? mod)
  }
  return xlsxModulePromise
}

/**
 * Resolve branding values for use in exports.
 * @param {object|null|undefined} branding - from useBranding() or getBranding()
 * @returns {{ footerText: string, headerHex: string }}
 */
function resolveBranding(branding) {
  const footerText = branding?.app_display_name || BRAND_FOOTER
  // Strip leading '#' from hex for libraries that expect a bare 6-char hex
  const raw = branding?.primary_color || ''
  const headerHex = raw.replace('#', '') || PPT_LAYOUT.headerBg
  return { footerText, headerHex }
}
const BULLET = '\u2022' // •
/** Excel in-cell line break (same as Alt+Enter) — one value per line in the cell. */
const EXCEL_LINE_BREAK = '\n'

/** Word: spacing in twips (20 twips = 1 pt) for professional hierarchy */
const WORD_SPACING = {
  titleAfter: 240,       // 12 pt after main title
  heading1Before: 180,   // 9 pt before section (adds separation)
  heading1After: 120,    // 6 pt after section title
  heading2After: 60,     // 3 pt after field label
  bodyAfter: 60,         // 3 pt after body/bullet
}

/** PowerPoint: layout (inches) for consistent, professional slides */
const PPT_LAYOUT = {
  marginX: 0.5,
  contentTop: 1.05,      // below header bar
  headerHeight: 0.85,
  titleFontSize: 18,
  labelFontSize: 11,
  bodyFontSize: 11,
  lineHeight: 0.22,      // single line
  bulletLineHeight: 0.2,
  gapAfterLabel: 0.08,
  gapAfterBulletBlock: 0.15,
  gapAfterSingleValue: 0.12,
  footerY: 5.15,
  footerFontSize: 9,
  headerBg: '1a365d',
  bodyColor: '2d3748',
  footerColor: '718096',
}

/**
 * Strip leading "N." or "N.M " from a title for consistent numbering.
 * @param {string} title - e.g. "5. Scope" or "Scope"
 * @returns {string} - e.g. "Scope"
 */
function stripLeadingNumber(title) {
  if (!title || typeof title !== 'string') return title || ''
  return title.replace(/^\d+(\.\d+)*\.?\s*/, '').trim() || title
}

/**
 * Build numbered section titles and flat fields with hierarchical labels (e.g. "5.1 In-Scope").
 * @param {Array<{title: string, fields: Array<{key: string, label: string}>}>} sections
 * @returns {{ sectionTitles: string[], flatNumberedFields: Array<{key: string, label: string}> }}
 */
function getNumberedSectionInfo(sections) {
  const sectionTitles = []
  const flatNumberedFields = []
  ;(sections || []).forEach((sec, sIdx) => {
    const sectionNum = sIdx + 1
    const cleanTitle = stripLeadingNumber(sec.title || '')
    sectionTitles.push(`${sectionNum}. ${cleanTitle}`)
    ;(sec.fields || []).forEach((f, fIdx) => {
      flatNumberedFields.push({
        key: f.key,
        label: `${sectionNum}.${fIdx + 1} ${f.label || f.key}`,
        ...(f.help ? { help: f.help } : {}),
        ...(f.example ? { example: f.example } : {}),
      })
    })
  })
  return { sectionTitles, flatNumberedFields }
}

/**
 * Normalize a field value to either a single text or a list of items (for multi-valued fields).
 * Handles: null/undefined, arrays, JSON array strings, dates, objects, primitives.
 * @returns {{ isList: true, items: string[] } | { isList: false, text: string }}
 */
function parseFieldValue(val) {
  if (val == null) return { isList: false, text: '' }
  if (Array.isArray(val)) {
    const items = val.map((v) => {
      if (v == null) return ''
      if (typeof v === 'object' && v !== null && typeof v.toISOString === 'function') return v.toISOString().split('T')[0]
      if (typeof v === 'object' && v !== null) return JSON.stringify(v)
      return String(v)
    })
    return { isList: true, items }
  }
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) {
        const items = parsed.map((v) => (v == null ? '' : String(v)))
        return { isList: true, items }
      }
    } catch (_) { /* ignore */ }
  }
  if (typeof val === 'object' && val !== null) {
    if (typeof val.toISOString === 'function') return { isList: false, text: val.toISOString().split('T')[0] }
    return { isList: false, text: String(val) }
  }
  return { isList: false, text: String(val) }
}

/**
 * Format value for display in exports (avoid [object Object], handle null/undefined).
 * Multi-valued fields (arrays / JSON array strings) are returned as bulleted lines for Excel cells.
 */
function formatCellValue(val) {
  const parsed = parseFieldValue(val)
  if (parsed.isList) {
    if (parsed.items.length === 0) return ''
    // One bullet per line in Excel (same as user pressing Alt+Enter between items)
    return parsed.items.map((item) => `${BULLET} ${item}`).join(EXCEL_LINE_BREAK)
  }
  return parsed.text
}

/** Format a record field for export, substituting blankPlaceholder when empty. */
function displayValue(val, blankPlaceholder = '—') {
  const formatted = formatCellValue(val)
  return formatted || blankPlaceholder
}

/** Optional offline guidance lines from field.help / field.example. */
function fieldGuidanceLines(field) {
  const lines = []
  const help = String(field?.help || '').trim()
  const example = String(field?.example || '').trim()
  if (help) lines.push(help)
  if (example) lines.push(`Example: ${example}`)
  return lines
}

/** Value cell text with optional guidance prefix (Excel/CSV/XML/JSON). */
function guidedCellValue(field, val, blankPlaceholder = '—') {
  const guidance = fieldGuidanceLines(field)
  const display = displayValue(val, blankPlaceholder)
  if (!guidance.length) return display
  return `${guidance.join('\n')}\n\n${display}`
}

/**
 * Set Wrap Text on any worksheet cell whose value is a string containing newlines.
 * So bulleted multi-values display one bullet per line in Excel.
 * @param {object} ws - worksheet from XLSX.utils.json_to_sheet or aoa_to_sheet
 */
function applyWrapTextForMultilineCells(XLSX, ws) {
  if (!ws || !ws['!ref']) return
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[ref]
      if (cell && cell.v != null && typeof cell.v === 'string' && cell.v.includes('\n')) {
        cell.s = { alignment: { wrapText: true } }
      }
    }
  }
}

/**
 * Export a list/table to Excel.
 * @param {Array<{key: string, label: string}>} columns - column definitions
 * @param {Array<Object>} rows - array of row objects (keyed by column.key)
 * @param {string} baseFilename - e.g. 'Mandates' (will get _YYYY-MM-DD.xlsx)
 */
export async function exportToExcel(columns, rows, baseFilename, branding) {
  const XLSX = await getXLSX()
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.xlsx`
  const { headerHex } = resolveBranding(branding)
  const ws = XLSX.utils.json_to_sheet(rows.map(row => {
    const out = {}
    columns.forEach(({ key, label }) => {
      out[label || key] = formatCellValue(row[key])
    })
    return out
  }), { header: columns.map(c => c.label || c.key) })
  // Apply brand colour to header row
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let C = range.s.c; C <= range.e.c; C++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c: C })
    if (ws[ref]) {
      ws[ref].s = {
        fill: { fgColor: { rgb: headerHex.toUpperCase() } },
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { wrapText: true }
      }
    }
  }
  applyWrapTextForMultilineCells(XLSX, ws)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, filename)
}

/** Word/PPT field picker: default selection count (CLAUDE.md rule 38). */
const DEFAULT_LIST_EXPORT_FIELDS = 5
const MAX_LIST_EXPORT_FIELDS = 10

/**
 * Export a list/table to Word (table format). Use selected columns only (e.g. 5–10 fields).
 * @param {Array<{key: string, label: string}>} columns - column definitions (subset for Word, max 10)
 * @param {Array<Object>} rows - array of row objects
 * @param {string} baseFilename - e.g. 'Mandates'
 */
export async function exportListToWord(columns, rows, baseFilename, branding) {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.docx`
  const { footerText, headerHex } = resolveBranding(branding)
  const exportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const headers = columns.map(c => c.label || c.key)
  const tableRows = [
    new TableRow({
      children: headers.map(h => new TableCell({
        children: [new Paragraph({ text: h, heading: HeadingLevel.HEADING_2, spacing: { after: 60 } })]
      })),
      tableHeader: true
    }),
    ...rows.map(row => new TableRow({
      children: columns.map(({ key }) => new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: formatCellValue(row[key]) || '—' })],
          spacing: { after: 40 }
        })]
      }))
    }))
  ]
  const children = [
    new Paragraph({
      text: baseFilename.replace(/_/g, ' '),
      heading: HeadingLevel.TITLE,
      spacing: { after: WORD_SPACING.titleAfter }
    }),
    new Paragraph({
      text: `Exported: ${exportDate} · ${rows.length} record(s)`,
      style: 'normal',
      spacing: { after: 120 }
    }),
    new Paragraph({ text: '' }),
    new Table({ rows: tableRows, width: { size: 100, type: 'pct' } }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [new TextRun({ text: footerText, size: 18, color: '666666' })],
      spacing: { before: 120 }
    })
  ]
  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a list/table to PowerPoint (table on slide). Use selected columns only (e.g. 5–10 fields).
 * Splits across multiple slides if many rows (e.g. ~15 rows per slide).
 * @param {Array<{key: string, label: string}>} columns - column definitions (subset for Word, max 10)
 * @param {Array<Object>} rows - array of row objects
 * @param {string} baseFilename - e.g. 'Mandates'
 */
export function exportListToPPT(columns, rows, baseFilename, branding) {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.pptx`
  const { footerText, headerHex } = resolveBranding(branding)
  const pptx = new pptxgen()
  pptx.title = baseFilename.replace(/_/g, ' ')
  pptx.author = footerText
  const headers = columns.map(c => c.label || c.key)
  const ROWS_PER_SLIDE = 18
  const { marginX, headerHeight, footerY, footerFontSize, footerColor } = PPT_LAYOUT
  const w = 9
  const titleSlide = pptx.addSlide()
  titleSlide.addText(baseFilename.replace(/_/g, ' '), { x: marginX, y: 1, w, h: 1, fontSize: 24, bold: true, color: headerHex })
  titleSlide.addText(`List export · ${rows.length} record(s)`, { x: marginX, y: 2, w, h: 0.5, fontSize: 14, color: '4a5568' })
  titleSlide.addText(`Exported: ${new Date().toLocaleDateString()}`, { x: marginX, y: 2.6, w, h: 0.4, fontSize: 10, color: footerColor })
  titleSlide.addText(footerText, { x: marginX, y: 5, w, h: 0.3, fontSize: footerFontSize, color: footerColor })
  for (let start = 0; start < rows.length; start += ROWS_PER_SLIDE) {
    const chunk = rows.slice(start, start + ROWS_PER_SLIDE)
    const slide = pptx.addSlide()
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: headerHeight, fill: { color: headerHex } })
    slide.addText(`Records ${start + 1}–${start + chunk.length} of ${rows.length}`, { x: marginX, y: 0.15, w, h: 0.35, fontSize: 14, bold: true, color: 'FFFFFF' })
    const tableRows = [
      headers.map(h => ({ text: h, options: { bold: true, fill: headerHex, color: 'FFFFFF' } })),
      ...chunk.map(row => columns.map(({ key }) => ({ text: formatCellValue(row[key]) || '—' })))
    ]
    slide.addTable(tableRows, { x: marginX, y: 0.75, w, colW: Array(columns.length).fill(w / columns.length), fontSize: 10, color: PPT_LAYOUT.bodyColor })
    slide.addText(footerText, { x: marginX, y: footerY, w, h: 0.3, fontSize: footerFontSize, color: footerColor })
  }
  pptx.writeFile({ fileName: filename })
}

export { DEFAULT_LIST_EXPORT_FIELDS, MAX_LIST_EXPORT_FIELDS }

/**
 * Export a single record to Excel (one row: headers in row 1, values in row 2).
 * Accepts either sections (for numbered headers 1.1, 1.2, 2.1...) or flat fields.
 * @param {Array<{title: string, fields: Array<{key: string, label: string}>}>|Array<{key: string, label: string}>} sectionsOrFields
 * @param {Object} record - single record object
 * @param {string} baseFilename - e.g. 'Mandate_MAN-2026-001'
 */
export async function exportRecordToExcel(sectionsOrFields, record, baseFilename, branding, blankPlaceholder = '—') {
  const XLSX = await getXLSX()
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.xlsx`
  const { headerHex } = resolveBranding(branding)
  const isSections = Array.isArray(sectionsOrFields) && sectionsOrFields.length > 0 && sectionsOrFields[0]?.fields != null
  const flatFields = isSections ? getNumberedSectionInfo(sectionsOrFields).flatNumberedFields : sectionsOrFields
  const headers = flatFields.map(f => f.label || f.key)
  const values = flatFields.map(f => guidedCellValue(f, record[f.key], blankPlaceholder))
  const ws = XLSX.utils.aoa_to_sheet([headers, values])
  // Apply brand colour to header row
  for (let C = 0; C < headers.length; C++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c: C })
    if (ws[ref]) {
      ws[ref].s = {
        fill: { fgColor: { rgb: headerHex.toUpperCase() } },
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { wrapText: true }
      }
    }
  }
  applyWrapTextForMultilineCells(XLSX, ws)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Record')
  XLSX.writeFile(wb, filename)
}

/**
 * Export a single record to Word. Sections = Heading 1, each field = Heading 2 + value (or bullet list).
 * @param {Array<{title: string, fields: Array<{key: string, label: string}>}>} sections
 * @param {Object} record
 * @param {string} baseFilename
 */
export async function exportRecordToWord(sections, record, baseFilename, branding, blankPlaceholder = '—') {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.docx`
  const { footerText, headerHex } = resolveBranding(branding)
  const children = []
  const exportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  // Title and subtitle with clear spacing
  children.push(new Paragraph({
    text: baseFilename.replace(/_/g, ' '),
    heading: HeadingLevel.TITLE,
    spacing: { after: WORD_SPACING.titleAfter }
  }))
  children.push(new Paragraph({
    text: `Exported: ${exportDate}`,
    style: 'normal',
    spacing: { after: 120 }
  }))
  children.push(new Paragraph({ text: '' }))

  const { sectionTitles, flatNumberedFields } = getNumberedSectionInfo(sections)
  let flatIdx = 0
  sections.forEach(({ title, fields }, sIdx) => {
    if (!title || !fields?.length) return
    children.push(new Paragraph({
      text: sectionTitles[sIdx],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: WORD_SPACING.heading1Before, after: WORD_SPACING.heading1After }
    }))
    fields.forEach((field) => {
      const { key, label } = field
      const numberedLabel = flatNumberedFields[flatIdx]?.label ?? (label || key)
      flatIdx += 1
      const parsed = parseFieldValue(record[key])
      children.push(new Paragraph({
        text: numberedLabel,
        heading: HeadingLevel.HEADING_2,
        spacing: { after: WORD_SPACING.heading2After }
      }))
      fieldGuidanceLines(field).forEach((line) => {
        children.push(new Paragraph({
          children: [new TextRun({ text: line, italics: true, size: 18, color: '666666' })],
          spacing: { after: 40 }
        }))
      })
      if (parsed.isList) {
        if (parsed.items.length === 0) {
          children.push(new Paragraph({
            children: [new TextRun({ text: blankPlaceholder })],
            spacing: { after: WORD_SPACING.bodyAfter }
          }))
        } else {
          parsed.items.forEach((item, i) => {
            children.push(new Paragraph({
              text: item || blankPlaceholder,
              bullet: { level: 0 },
              spacing: { after: i < parsed.items.length - 1 ? 60 : WORD_SPACING.bodyAfter }
            }))
          })
        }
      } else {
        children.push(new Paragraph({
          children: [new TextRun({ text: parsed.text || blankPlaceholder })],
          spacing: { after: WORD_SPACING.bodyAfter }
        }))
      }
    })
    children.push(new Paragraph({ text: '' }))
  })

  // Footer
  children.push(new Paragraph({ text: '' }))
  children.push(new Paragraph({
    children: [new TextRun({ text: footerText, size: 18, color: headerHex || '666666' })],
    spacing: { before: 120 }
  }))

  const doc = new Document({
    sections: [{ properties: {}, children }]
  })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a single record to PowerPoint. One slide per section; title bar + key-value body.
 * @param {Array<{title: string, fields: Array<{key: string, label: string}>}>} sections
 * @param {Object} record - used for first slide title/ref if present
 * @param {string} baseFilename
 */
export function exportRecordToPPT(sections, record, baseFilename, branding, blankPlaceholder = '—') {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.pptx`
  const { footerText, headerHex } = resolveBranding(branding)
  const pptx = new pptxgen()
  pptx.title = baseFilename.replace(/_/g, ' ')
  pptx.author = footerText

  const ref = record?.mandate_reference || record?.document_ref || record?.reference_number || record?.id || ''
  const title = record?.mandate_title || record?.report_title || record?.name || record?.title || baseFilename

  const { marginX, headerHeight, bodyColor, footerColor, footerY, footerFontSize } = PPT_LAYOUT
  const w = 9

  // Title slide — clean hierarchy
  const titleSlide = pptx.addSlide()
  titleSlide.addText(title, { x: marginX, y: 1, w, h: 1, fontSize: 24, bold: true, color: headerHex })
  if (ref) titleSlide.addText(ref, { x: marginX, y: 2, w, h: 0.5, fontSize: 14, color: '4a5568' })
  titleSlide.addText(`Exported: ${new Date().toLocaleDateString()}`, { x: marginX, y: 2.6, w, h: 0.4, fontSize: 10, color: footerColor })
  titleSlide.addText(footerText, { x: marginX, y: 5, w, h: 0.3, fontSize: footerFontSize, color: footerColor })

  const { sectionTitles, flatNumberedFields } = getNumberedSectionInfo(sections)
  let flatLabelIdx = 0
  const { contentTop, titleFontSize, labelFontSize, lineHeight, bulletLineHeight, gapAfterLabel, gapAfterBulletBlock, gapAfterSingleValue } = PPT_LAYOUT

  // Content slides — consistent header bar, spacing, and footer
  sections.forEach(({ title: sectionTitle, fields }, sIdx) => {
    if (!sectionTitle || !fields?.length) return
    const slide = pptx.addSlide()
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: headerHeight, fill: { color: headerHex } })
    slide.addText(sectionTitles[sIdx], {
      x: marginX, y: 0.2, w, h: 0.5,
      fontSize: titleFontSize, bold: true, color: 'FFFFFF'
    })
    let y = contentTop
    fields.forEach((field) => {
      const { key, label } = field
      const numberedLabel = flatNumberedFields[flatLabelIdx]?.label ?? `${label || key}`
      flatLabelIdx += 1
      const labelText = `${numberedLabel}:`
      const parsed = parseFieldValue(record[key])
      slide.addText(labelText, { x: marginX, y, w, h: lineHeight, fontSize: labelFontSize, bold: true, color: bodyColor })
      y += lineHeight + gapAfterLabel
      fieldGuidanceLines(field).forEach((line) => {
        const gh = Math.min(lineHeight * Math.ceil(line.length / 70), 1.2)
        slide.addText(line, { x: marginX, y, w, h: gh, fontSize: 9, italic: true, color: footerColor })
        y += gh + gapAfterLabel
      })
      if (parsed.isList) {
        if (parsed.items.length === 0) {
          slide.addText(blankPlaceholder, { x: marginX, y, w, h: lineHeight, fontSize: labelFontSize, color: bodyColor })
          y += lineHeight + gapAfterSingleValue
        } else {
          const bulletRuns = parsed.items.map((item, i) => ({
            text: item || blankPlaceholder,
            options: { bullet: true, breakLine: i < parsed.items.length - 1 }
          }))
          const blockH = Math.min(bulletLineHeight * parsed.items.length, 3.5)
          slide.addText(bulletRuns, { x: marginX, y, w, h: blockH, fontSize: labelFontSize, color: bodyColor })
          y += blockH + gapAfterBulletBlock
        }
      } else {
        const value = parsed.text || blankPlaceholder
        const lines = value.length > 80 ? value.match(/.{1,80}(\s|$)/g) || [value] : [value]
        const h = lineHeight * lines.length
        slide.addText(lines.join('\n'), { x: marginX, y, w, h, fontSize: labelFontSize, color: bodyColor })
        y += h + gapAfterSingleValue
      }
    })
    slide.addText(footerText, { x: marginX, y: footerY, w, h: 0.3, fontSize: footerFontSize, color: footerColor })
  })

  pptx.writeFile({ fileName: filename })
}

// --- List exports: CSV, XML, JSON, Print ---

/**
 * Escape a value for CSV (wrap in quotes if contains comma, newline, or quote).
 */
function csvEscape(val) {
  const s = val == null ? '' : String(val)
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Export a list/table to CSV.
 * @param {Array<{key: string, label: string}>} columns
 * @param {Array<Object>} rows
 * @param {string} baseFilename
 */
export function exportListToCSV(columns, rows, baseFilename) {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.csv`
  const headers = columns.map(c => c.label || c.key)
  const headerLine = headers.map(h => csvEscape(h)).join(',')
  const dataLines = rows.map(row =>
    columns.map(({ key }) => csvEscape(formatCellValue(row[key]))).join(',')
  )
  const csv = [headerLine, ...dataLines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a list/table to XML (simple root with row elements, each with child elements per column).
 * @param {Array<{key: string, label: string}>} columns
 * @param {Array<Object>} rows
 * @param {string} baseFilename
 */
export function exportListToXML(columns, rows, baseFilename) {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.xml`
  const rootName = baseFilename.replace(/[^a-zA-Z0-9]/g, '_') || 'Export'
  const escapeXml = (s) => {
    if (s == null) return ''
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
  const tag = (name) => name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'field'
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += `<${rootName} exported="${new Date().toISOString()}" count="${rows.length}">\n`
  rows.forEach((row, i) => {
    xml += `  <row index="${i + 1}">\n`
    columns.forEach(({ key, label }) => {
      const elName = tag(label || key)
      xml += `    <${elName}>${escapeXml(formatCellValue(row[key]))}</${elName}>\n`
    })
    xml += '  </row>\n'
  })
  xml += `</${rootName}>`
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a list/table to JSON (array of objects with column labels as keys).
 * @param {Array<{key: string, label: string}>} columns
 * @param {Array<Object>} rows
 * @param {string} baseFilename
 */
export function exportListToJSON(columns, rows, baseFilename) {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.json`
  const data = rows.map(row => {
    const obj = {}
    columns.forEach(({ key, label }) => {
      obj[label || key] = formatCellValue(row[key])
    })
    return obj
  })
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printHtml(html, title) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.onload = () => { w.print(); w.close() }
}

/**
 * Export a list/table to Print (opens printable table in new window).
 * @param {Array<{key: string, label: string}>} columns
 * @param {Array<Object>} rows
 * @param {string} baseFilename
 */
export function exportListToPrint(columns, rows, baseFilename, branding) {
  const { footerText } = resolveBranding(branding)
  const title = baseFilename.replace(/_/g, ' ')
  const headers = columns.map(c => c.label || c.key)
  const thead = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')
  const trs = rows.map(row =>
    '<tr>' + columns.map(({ key }) => `<td>${escapeHtml(formatCellValue(row[key]))}</td>`).join('') + '</tr>'
  ).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:sans-serif;padding:16px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ccc;padding:8px;text-align:left;} th{background:#333;color:#fff;}</style></head>
<body><h1>${escapeHtml(title)}</h1><p>Exported: ${new Date().toLocaleString()} · ${rows.length} record(s)</p>
<table><thead><tr>${thead}</tr></thead><tbody>${trs}</tbody></table>
<p style="margin-top:24px;color:#666;">${footerText}</p></body></html>`
  printHtml(html, title)
}

/**
 * Export a list/table to PDF.
 * @param {Array<{key: string, label: string}>} columns
 * @param {Array<Object>} rows
 * @param {string} baseFilename
 * @param {string} [reportTitle]
 */
export function exportListToPDF(columns, rows, baseFilename, reportTitle = null) {
  const title = reportTitle || baseFilename.replace(/_/g, ' ')
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.pdf`
  const doc = new jsPDF({
    orientation: columns.length > 6 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  })
  doc.setFontSize(14)
  doc.text(title, 40, 40)
  doc.setFontSize(10)
  doc.text(`Exported: ${new Date().toLocaleString()} · ${rows.length} record(s)`, 40, 58)

  autoTable(doc, {
    startY: 72,
    head: [columns.map((column) => column.label || column.key)],
    body: rows.map((row) => columns.map(({ key }) => formatCellValue(row[key]))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [26, 54, 93] },
    margin: { left: 40, right: 40 },
  })

  doc.save(filename)
}

// --- Record exports: CSV, XML, JSON, Print ---

/**
 * Export a single record to CSV (one data row after header row).
 * @param {Array<{title: string, fields: Array<{key: string, label: string}>}>|Array<{key: string, label: string}>} sectionsOrFields
 * @param {Object} record
 * @param {string} baseFilename
 */
export function exportRecordToCSV(sectionsOrFields, record, baseFilename, branding, blankPlaceholder = '—') {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.csv`
  const isSections = Array.isArray(sectionsOrFields) && sectionsOrFields.length > 0 && sectionsOrFields[0]?.fields != null
  const flatFields = isSections ? getNumberedSectionInfo(sectionsOrFields).flatNumberedFields : sectionsOrFields
  const headers = flatFields.map(f => f.label || f.key)
  const values = flatFields.map(f => csvEscape(guidedCellValue(f, record[f.key], blankPlaceholder)))
  const csv = [headers.map(h => csvEscape(h)).join(','), values.join(',')].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a single record to XML (flat key-value elements under one record element).
 * @param {Array<{title: string, fields: Array<{key: string, label: string}>}>|Array<{key: string, label: string}>} sectionsOrFields
 * @param {Object} record
 * @param {string} baseFilename
 */
export function exportRecordToXML(sectionsOrFields, record, baseFilename, branding, blankPlaceholder = '—') {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.xml`
  const isSections = Array.isArray(sectionsOrFields) && sectionsOrFields.length > 0 && sectionsOrFields[0]?.fields != null
  const flatFields = isSections ? getNumberedSectionInfo(sectionsOrFields).flatNumberedFields : sectionsOrFields
  const rootName = baseFilename.replace(/[^a-zA-Z0-9]/g, '_') || 'Record'
  const escapeXml = (s) => {
    if (s == null) return ''
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
  const tag = (name) => name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'field'
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += `<${rootName} exported="${new Date().toISOString()}">\n`
  flatFields.forEach((field) => {
    const { key, label } = field
    const elName = tag(label || key)
    xml += `  <${elName}>${escapeXml(guidedCellValue(field, record[key], blankPlaceholder))}</${elName}>\n`
  })
  xml += `</${rootName}>`
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a single record to JSON (object with field labels as keys).
 * @param {Array<{title: string, fields: Array<{key: string, label: string}>}>|Array<{key: string, label: string}>} sectionsOrFields
 * @param {Object} record
 * @param {string} baseFilename
 */
export function exportRecordToJSON(sectionsOrFields, record, baseFilename, branding, blankPlaceholder = '—') {
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.json`
  const isSections = Array.isArray(sectionsOrFields) && sectionsOrFields.length > 0 && sectionsOrFields[0]?.fields != null
  const flatFields = isSections ? getNumberedSectionInfo(sectionsOrFields).flatNumberedFields : sectionsOrFields
  const obj = {}
  flatFields.forEach((field) => {
    const { key, label } = field
    obj[label || key] = guidedCellValue(field, record[key], blankPlaceholder)
  })
  const json = JSON.stringify(obj, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a single record to Print (opens printable key-value document in new window).
 * @param {Array<{title: string, fields: Array<{key: string, label: string}>}>|Array<{key: string, label: string}>} sectionsOrFields
 * @param {Object} record
 * @param {string} baseFilename
 */
export function exportRecordToPrint(sectionsOrFields, record, baseFilename, branding, blankPlaceholder = '—') {
  const { footerText } = resolveBranding(branding)
  const title = baseFilename.replace(/_/g, ' ')
  const isSections = Array.isArray(sectionsOrFields) && sectionsOrFields.length > 0 && sectionsOrFields[0]?.fields != null
  const { sectionTitles, flatNumberedFields } = isSections ? getNumberedSectionInfo(sectionsOrFields) : { sectionTitles: [], flatNumberedFields: sectionsOrFields || [] }
  let body = ''
  if (isSections && sectionTitles.length) {
    let flatIdx = 0
    sectionsOrFields.forEach((sec, sIdx) => {
      body += `<h2>${escapeHtml(sectionTitles[sIdx])}</h2><table style="margin-bottom:16px;">`
      ;(sec.fields || []).forEach((field) => {
        const { key, label } = field
        const l = flatNumberedFields[flatIdx]?.label ?? (label || key)
        flatIdx += 1
        const guideHtml = fieldGuidanceLines(field).map((line) =>
          `<div style="font-style:italic;color:#666;font-size:12px;margin-bottom:4px;">${escapeHtml(line)}</div>`
        ).join('')
        body += `<tr><td style="font-weight:bold;padding:4px 8px;vertical-align:top;">${escapeHtml(l)}</td><td style="padding:4px 8px;">${guideHtml}${escapeHtml(displayValue(record[key], blankPlaceholder))}</td></tr>`
      })
      body += '</table>'
    })
  } else {
    body = '<table>'
    flatNumberedFields.forEach((field) => {
      const { key, label } = field
      const guideHtml = fieldGuidanceLines(field).map((line) =>
        `<div style="font-style:italic;color:#666;font-size:12px;margin-bottom:4px;">${escapeHtml(line)}</div>`
      ).join('')
      body += `<tr><td style="font-weight:bold;padding:4px 8px;vertical-align:top;">${escapeHtml(label || key)}</td><td style="padding:4px 8px;">${guideHtml}${escapeHtml(displayValue(record[key], blankPlaceholder))}</td></tr>`
    })
    body += '</table>'
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:sans-serif;padding:16px;} table{border-collapse:collapse;} td{border:1px solid #ccc;} h2{margin-top:16px;}</style></head>
<body><h1>${escapeHtml(title)}</h1><p>Exported: ${new Date().toLocaleString()}</p>${body}
<p style="margin-top:24px;color:#666;">${footerText}</p></body></html>`
  printHtml(html, title)
}

/**
 * Export a single record to PDF. One autoTable per section (Label / Value columns).
 * @param {Array<{title: string, fields: Array<{key: string, label: string}>}>} sections
 * @param {Object} record
 * @param {string} baseFilename
 * @param {object} [branding]
 * @param {string} [blankPlaceholder='—']
 */
export function exportRecordToPDF(sections, record, baseFilename, branding, blankPlaceholder = '—') {
  const { footerText, headerHex } = resolveBranding(branding)
  const title = baseFilename.replace(/_/g, ' ')
  const filename = `${baseFilename}_${new Date().toISOString().split('T')[0]}.pdf`
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const exportDate = new Date().toLocaleString()

  doc.setFontSize(14)
  doc.text(title, 40, 40)
  doc.setFontSize(10)
  doc.text(`Exported: ${exportDate}`, 40, 58)

  const fillRgb = (() => {
    const hex = (headerHex || '1a365d').replace('#', '')
    if (hex.length !== 6) return [26, 54, 93]
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  })()

  const { sectionTitles, flatNumberedFields } = getNumberedSectionInfo(sections || [])
  let flatIdx = 0
  let startY = 72

  ;(sections || []).forEach(({ title: sectionTitle, fields }, sIdx) => {
    if (!sectionTitle || !fields?.length) return
    const body = fields.map((field) => {
      const { key, label } = field
      const numberedLabel = flatNumberedFields[flatIdx]?.label ?? (label || key)
      flatIdx += 1
      const parsed = parseFieldValue(record[key])
      let value
      if (parsed.isList) {
        value = parsed.items.length === 0
          ? blankPlaceholder
          : parsed.items.map((item) => `${BULLET} ${item || blankPlaceholder}`).join('\n')
      } else {
        value = parsed.text || blankPlaceholder
      }
      const guidance = fieldGuidanceLines(field)
      if (guidance.length) value = `${guidance.join('\n')}\n\n${value}`
      return [numberedLabel, value]
    })

    autoTable(doc, {
      startY,
      head: [[sectionTitles[sIdx], '']],
      body,
      styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: fillRgb, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 180, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
      margin: { left: 40, right: 40 },
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index === 1) {
          data.cell.text = []
        }
      },
    })
    startY = (doc.lastAutoTable?.finalY || startY) + 16
  })

  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFontSize(8)
  doc.setTextColor(100)
  doc.text(footerText, 40, pageHeight - 24)
  doc.save(filename)
}
