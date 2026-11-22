/**
 * AdminFieldLabelWithHelp — a field label with contextual help (Admin rule 23; Admin's own copy of the monorepo
 * @nidus/ui FieldLabelWithHelp, monorepo v1345 slice 6 — no cross-repo import).
 *
 * - No help row for the key (or no AdminFieldHelpScope) → the plain label, no ⓘ (never placeholder help).
 * - With help: ⓘ appears on hover / focus of the label or its field (faintly visible on touch screens);
 *   double-click on the label opens it (not for checkbox / radio / toggle labels).
 * - Popover: purpose, rules read from the live field, examples, format, notes. Escape or a click elsewhere
 *   closes it. Text is rendered as text, never HTML.
 * - Admin has no usage events, votes or Learn-more links (kept out of v1 on purpose).
 */
import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, X } from 'lucide-react'
import { useAdminFieldHelp } from './AdminFieldHelpScope.jsx'
import { buildAdminHelpRules, parseAdminHelpText, resolveAdminHelpTokens } from './adminFieldHelp.js'

const NO_DOUBLE_CLICK = new Set(['checkbox', 'radio', 'toggle'])
const POPOVER_WIDTH = 320
const EDGE = 16
const GAP = 6

/** Leading text nodes form the label row (with ⓘ); anything after (a nested control) goes under it. */
export function partitionAdminLabelChildren(children, control = 'text') {
  const nodes = Children.toArray(children)
  if (NO_DOUBLE_CLICK.has(control)) return { mode: 'inline', labelNodes: nodes, fieldNodes: [] }
  const labelNodes = []
  let i = 0
  while (i < nodes.length && (typeof nodes[i] === 'string' || typeof nodes[i] === 'number')) {
    if (!(typeof nodes[i] === 'string' && nodes[i].trim() === '' && labelNodes.length === 0)) labelNodes.push(nodes[i])
    i += 1
  }
  const fieldNodes = nodes.slice(i)
  const first = fieldNodes[0]
  const leadingControl = labelNodes.length === 0 && isValidElement(first)
    && (first.type === 'input' || first.type === 'select' || first.props?.type === 'checkbox' || first.props?.type === 'radio')
  if (leadingControl) return { mode: 'inline', labelNodes: nodes, fieldNodes: [] }
  return { mode: 'stacked', labelNodes, fieldNodes }
}

/** Below the ⓘ when the card fits, otherwise above; else the side with more room (card scrolls). */
export function computeAdminHelpPlacement({ rect, height, viewportWidth, viewportHeight, width = POPOVER_WIDTH }) {
  const w = Math.min(width, viewportWidth - EDGE * 2)
  const left = Math.max(EDGE, Math.min(rect.left - 8, viewportWidth - w - EDGE))
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - GAP - EDGE)
  const spaceAbove = Math.max(0, rect.top - GAP - EDGE)
  const below = (maxHeight) => ({ side: 'below', top: rect.bottom + GAP, left, width: w, maxHeight })
  const above = (h, maxHeight) => ({ side: 'above', top: rect.top - GAP - h, left, width: w, maxHeight })
  if (height == null || height <= spaceBelow) return below(spaceBelow)
  if (height <= spaceAbove) return above(height, spaceAbove)
  return spaceAbove > spaceBelow ? above(spaceAbove, spaceAbove) : below(spaceBelow)
}

function readFieldRules(htmlFor) {
  if (!htmlFor || typeof document === 'undefined') return {}
  const el = document.getElementById(htmlFor)
  if (!el) return {}
  const rules = {}
  if ('required' in el) rules.required = Boolean(el.required)
  if (el.tagName === 'SELECT') rules.options = Array.from(el.options).map((o) => o.textContent.trim()).filter(Boolean)
  if (el.maxLength > 0) rules.maxLength = el.maxLength
  const min = el.getAttribute?.('min')
  const max = el.getAttribute?.('max')
  if (min != null && min !== '' && Number.isFinite(Number(min))) rules.min = Number(min)
  if (max != null && max !== '' && Number.isFinite(Number(max))) rules.max = Number(max)
  return rules
}

function HelpText({ text }) {
  return parseAdminHelpText(resolveAdminHelpTokens(text)).map((block, i) => (block.type === 'ul'
    ? <ul key={i} className="list-disc pl-5 space-y-0.5">{block.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
    : <p key={i}>{block.text}</p>))
}

function Section({ heading, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">{heading}</p>
      <div className="mt-0.5 space-y-1 text-sm text-gray-800 dark:text-gray-100">{children}</div>
    </div>
  )
}

export function AdminFieldLabelWithHelp({
  helpKey, as: Tag = 'label', htmlFor, className = '', children, control = 'text',
  required, maxLength, min, max, options,
  /** false for record / people pickers: their options are other records, never listed in help. */
  listOptions = true,
}) {
  const help = useAdminFieldHelp(helpKey)
  const popoverId = useId()
  const titleId = useId()
  const buttonRef = useRef(null)
  const popoverRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [fieldActive, setFieldActive] = useState(false)
  const [position, setPosition] = useState(null)
  const [fieldRules, setFieldRules] = useState({})

  const close = useCallback((returnFocus) => {
    setOpen(false)
    setPosition(null)
    if (returnFocus) buttonRef.current?.focus()
  }, [])
  const openHelp = useCallback(() => { setFieldRules(readFieldRules(htmlFor)); setOpen(true) }, [htmlFor])

  useEffect(() => {
    if (!help || !htmlFor || typeof document === 'undefined') return undefined
    const field = document.getElementById(htmlFor)
    if (!field) return undefined
    const on = () => setFieldActive(true)
    const off = () => setFieldActive(false)
    field.addEventListener('focus', on); field.addEventListener('blur', off)
    field.addEventListener('mouseenter', on); field.addEventListener('mouseleave', off)
    return () => {
      field.removeEventListener('focus', on); field.removeEventListener('blur', off)
      field.removeEventListener('mouseenter', on); field.removeEventListener('mouseleave', off)
    }
  }, [help, htmlFor])

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const height = popoverRef.current ? popoverRef.current.scrollHeight + 2 : null
    setPosition({ ...computeAdminHelpPlacement({ rect, height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }), measured: height != null })
  }, [])
  useLayoutEffect(() => {
    if (!open) return undefined
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [open, place])
  useLayoutEffect(() => { if (open && position && !position.measured) place() }, [open, position, place])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true) } }
    const onDown = (e) => {
      if (popoverRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return
      close(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open, close])

  useEffect(() => {
    if (!open || !htmlFor || typeof document === 'undefined') return undefined
    const field = document.getElementById(htmlFor)
    if (!field) return undefined
    const previous = field.getAttribute('aria-describedby')
    field.setAttribute('aria-describedby', [previous, popoverId].filter(Boolean).join(' '))
    return () => { if (previous) field.setAttribute('aria-describedby', previous); else field.removeAttribute('aria-describedby') }
  }, [open, htmlFor, popoverId])

  if (!help) return <Tag htmlFor={Tag === 'label' ? htmlFor : undefined} className={className}>{children}</Tag>

  const doubleClick = !NO_DOUBLE_CLICK.has(control)
  const pick = (prop, live) => (prop === undefined ? live : prop)
  const rules = buildAdminHelpRules({
    required: pick(required, fieldRules.required),
    maxLength: pick(maxLength, fieldRules.maxLength),
    min: pick(min, fieldRules.min),
    max: pick(max, fieldRules.max),
    options: listOptions ? pick(options, fieldRules.options) : undefined,
  })
  const { mode, labelNodes, fieldNodes } = partitionAdminLabelChildren(children, control)
  const revealed = open || fieldActive

  const helpButton = (
    <button
      ref={buttonRef}
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (open) close(false); else openHelp() }}
      aria-label={`Help: ${help.title}`}
      aria-expanded={open}
      aria-controls={open ? popoverId : undefined}
      aria-haspopup="dialog"
      className={`ml-1 inline-flex shrink-0 align-middle rounded-full p-0.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:opacity-100 group-hover/fieldhelp:opacity-100 transition-opacity ${revealed ? 'opacity-100' : 'opacity-0 pointer-coarse:opacity-60'}`}
    >
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )

  return (
    <Tag
      htmlFor={Tag === 'label' ? htmlFor : undefined}
      className={`group/fieldhelp ${className}`}
      onMouseDown={(e) => { if (doubleClick && e.detail > 1) e.preventDefault() }}
      onDoubleClick={(e) => {
        if (!doubleClick || popoverRef.current?.contains(e.target)) return
        e.preventDefault()
        window.getSelection?.()?.removeAllRanges?.()
        openHelp()
      }}
      data-help-key={helpKey}
    >
      {mode === 'inline' ? (<>{labelNodes}{helpButton}</>) : (
        <>
          <span className="inline-flex items-center gap-x-0.5 max-w-full"><span>{labelNodes}</span>{helpButton}</span>
          {fieldNodes}
        </>
      )}
      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-labelledby={titleId}
          data-side={position.side}
          style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, overflowY: 'auto', zIndex: 1000, visibility: position.measured ? 'visible' : 'hidden' }}
          className="rounded-lg border border-sky-200 dark:border-sky-800 border-l-4 border-l-sky-500 dark:border-l-sky-400 bg-sky-50 dark:bg-slate-900 shadow-xl p-4 space-y-3 text-left font-normal normal-case"
        >
          <div className="flex items-start justify-between gap-2">
            <p id={titleId} className="text-sm font-semibold text-gray-900 dark:text-white">{help.title}</p>
            <button type="button" onClick={() => close(true)} aria-label="Close help" className="rounded p-0.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <Section heading="Purpose"><HelpText text={help.purpose} /></Section>
          {rules.length > 0 && <Section heading="Rules"><ul className="list-disc pl-5 space-y-0.5">{rules.map((r) => <li key={r}>{r}</li>)}</ul></Section>}
          {help.examples && <Section heading="Examples"><HelpText text={help.examples} /></Section>}
          {help.format_notes && <Section heading="Format"><HelpText text={help.format_notes} /></Section>}
          {help.extra_notes && <Section heading="Notes"><HelpText text={help.extra_notes} /></Section>}
        </div>,
        document.body,
      )}
    </Tag>
  )
}

export default AdminFieldLabelWithHelp
