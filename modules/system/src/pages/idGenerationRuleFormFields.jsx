import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminField, inputClass, SearchableSelect } from '@nidus-admin/ui'
import { previewIdGenerationCapacity } from '@nidus-admin/shared'
import { buildIdPreview, computeKeyspaceSize, formatKeyspaceSize, formatPreviewPattern } from './idGenerationPreview.js'
import { buildGeneratedIdsListPath, splitDisplayIdParts } from './displayIdSearch.js'
import {
  getTableName,
  getTableSchema,
  qualifiedTableName,
  RULE_TAB_LABELS,
} from './idGenerationConstants.js'
import {
  applyTableDefaults,
  DEFAULT_NUM_DIGITS,
  DEFAULT_NUM_LETTERS,
  getAbbreviationValidationError,
} from './idGenerationTableDefaults.js'

export const LETTER_CASE_OPTIONS = [
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'mixed', label: 'Mixed' },
]

export const SEGMENT_TYPE_OPTIONS = [
  { value: 'alphanumeric', label: 'Alpha-numeric' },
  { value: 'alpha', label: 'Alpha' },
  { value: 'numeric', label: 'Numeric' },
]

export const EMPTY_ID_RULE_FORM = {
  target_table: '',
  table_abbreviation: '',
  table_description: '',
  separator: '-',
  suffix: '',
  segment_type: 'alphanumeric',
  letter_case: 'uppercase',
  num_letters: DEFAULT_NUM_LETTERS,
  num_digits: DEFAULT_NUM_DIGITS,
  excluded_chars: '',
  seed_value: 1,
  is_active: true,
}

function inferSegmentType(rule) {
  if (rule.segment_type) return rule.segment_type
  const letters = Number(rule.num_letters) || 0
  const digits = Number(rule.num_digits) || 0
  if (letters > 0 && digits === 0) return 'alpha'
  if (digits > 0 && letters === 0) return 'numeric'
  return 'alphanumeric'
}

export function ruleToForm(rule) {
  const segmentType = inferSegmentType(rule)
  return {
    target_table: rule.target_table || '',
    table_abbreviation: rule.table_abbreviation || '',
    table_description: rule.table_description || '',
    separator: rule.separator ?? '-',
    suffix: rule.suffix || '',
    segment_type: segmentType,
    letter_case: rule.letter_case || 'uppercase',
    num_letters: rule.num_letters ?? (segmentType === 'numeric' ? 0 : DEFAULT_NUM_LETTERS),
    num_digits: rule.num_digits ?? (segmentType === 'alpha' ? 0 : DEFAULT_NUM_DIGITS),
    excluded_chars: rule.excluded_chars || '',
    seed_value: rule.seed_value ?? 1,
    is_active: rule.is_active !== false,
  }
}

function applySegmentTypeChange(prev, segmentType) {
  const next = { ...prev, segment_type: segmentType }
  if (segmentType === 'numeric') {
    next.num_letters = 0
    if (!next.num_digits) next.num_digits = DEFAULT_NUM_DIGITS
  } else if (segmentType === 'alpha') {
    next.num_digits = 0
    if (!next.num_letters) next.num_letters = DEFAULT_NUM_LETTERS
  } else if (!next.num_letters && !next.num_digits) {
    next.num_letters = DEFAULT_NUM_LETTERS
    next.num_digits = DEFAULT_NUM_DIGITS
  }
  return next
}

export default function IdGenerationRuleFormFields({
  form,
  setForm,
  tables,
  tablesLoading,
  previewKey,
  lockTargetTable = false,
  autoFillFromTable = false,
  existingRules = [],
  excludeRuleId = null,
  onCapacityChange,
}) {
  const preview = useMemo(() => buildIdPreview(form), [form, previewKey])
  const previewParts = useMemo(() => splitDisplayIdParts(preview), [preview])
  const generatedIdsSearchPath = useMemo(() => (
    form.target_table
      ? buildGeneratedIdsListPath({ table: form.target_table })
      : buildGeneratedIdsListPath()
  ), [form.target_table])
  const localKeyspace = useMemo(() => computeKeyspaceSize(form), [form])
  const [capacity, setCapacity] = useState(null)
  const [capacityLoading, setCapacityLoading] = useState(false)
  const segmentType = form.segment_type || 'alphanumeric'
  const showLetters = segmentType !== 'numeric'
  const showDigits = segmentType !== 'alpha'
  const showLetterCase = segmentType !== 'numeric'

  useEffect(() => {
    let cancelled = false

    if (!form.target_table) {
      setCapacity(null)
      onCapacityChange?.(null)
      return undefined
    }

    setCapacityLoading(true)
    previewIdGenerationCapacity(form).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setCapacity(null)
        onCapacityChange?.(null)
      } else {
        setCapacity(data)
        onCapacityChange?.(data)
      }
      setCapacityLoading(false)
    })

    return () => { cancelled = true }
  }, [
    form.target_table,
    form.num_letters,
    form.num_digits,
    form.letter_case,
    form.excluded_chars,
    form.segment_type,
    onCapacityChange,
  ])

  const capacityBlocked = Boolean(capacity?.capacity_exceeded)
  const neededCount = capacity
    ? Math.max(Number(capacity.table_row_count) || 0, Number(capacity.generated_count) || 0)
    : 0
  const usagePct = capacity?.usage_pct != null ? Number(capacity.usage_pct) : null
  const abbreviationError = useMemo(
    () => getAbbreviationValidationError(form.table_abbreviation, existingRules, excludeRuleId),
    [form.table_abbreviation, existingRules, excludeRuleId],
  )

  const tableOptions = useMemo(() => {
    const seen = new Set()
    const options = []

    for (const row of tables) {
      const value = qualifiedTableName(row)
      if (!value || seen.has(value)) continue
      seen.add(value)
      const schema = row.table_schema || getTableSchema(value)
      options.push({
        value,
        label: `${getTableName(value)} (${RULE_TAB_LABELS[schema] || schema})`,
        category: RULE_TAB_LABELS[schema] || schema,
        description: value,
      })
    }

    if (form.target_table && !seen.has(form.target_table)) {
      const schema = getTableSchema(form.target_table)
      options.push({
        value: form.target_table,
        label: `${getTableName(form.target_table)} (${RULE_TAB_LABELS[schema] || schema})`,
        category: RULE_TAB_LABELS[schema] || schema,
        description: form.target_table,
      })
    }

    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [tables, form.target_table])

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AdminField label="Database Table" required>
        <SearchableSelect
          value={form.target_table}
          onChange={(nextValue) => setForm((prev) => (
            autoFillFromTable
              ? applyTableDefaults(prev, nextValue, existingRules, excludeRuleId)
              : { ...prev, target_table: nextValue }
          ))}
          options={tableOptions}
          disabled={tablesLoading || lockTargetTable}
          placeholder={tablesLoading ? 'Loading tables...' : 'Select a table...'}
          searchPlaceholder="Search tables..."
          emptyMessage="No matching tables. Try another search term."
          groupByCategory
        />
      </AdminField>
      <AdminField label="Table Abbreviation" required>
        <input
          value={form.table_abbreviation}
          maxLength={4}
          onChange={(e) => setForm((prev) => ({
            ...prev,
            table_abbreviation: e.target.value.toUpperCase().replace(/[^A-Z]/g, ''),
          }))}
          className={`${inputClass}${abbreviationError ? ' border-red-600 focus:border-red-500' : ''}`}
          placeholder="ABD"
          aria-invalid={Boolean(abbreviationError)}
        />
        {abbreviationError ? (
          <p className="mt-1 text-xs text-red-300">{abbreviationError}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-500">
            Must be unique across all ID rules — used as an alternate key (e.g. ABD → admin.id_generation_rules).
          </p>
        )}
      </AdminField>
      <div className="md:col-span-2">
        <AdminField label="Table Description">
          <input
            value={form.table_description}
            onChange={(e) => setForm((prev) => ({ ...prev, table_description: e.target.value }))}
            className={inputClass}
          />
        </AdminField>
      </div>
      <AdminField label="Separator">
        <input
          value={form.separator}
          maxLength={2}
          onChange={(e) => setForm((prev) => ({ ...prev, separator: e.target.value }))}
          className={inputClass}
          placeholder="-"
        />
      </AdminField>
      <AdminField label="Suffix">
        <input
          value={form.suffix}
          onChange={(e) => setForm((prev) => ({ ...prev, suffix: e.target.value }))}
          className={inputClass}
        />
      </AdminField>
      <AdminField label="ID Type" required>
        <select
          value={segmentType}
          onChange={(e) => setForm((prev) => applySegmentTypeChange(prev, e.target.value))}
          className={inputClass}
        >
          {SEGMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </AdminField>
      {showLetterCase && (
        <AdminField label="Letter Case">
          <select
            value={form.letter_case}
            onChange={(e) => setForm((prev) => ({ ...prev, letter_case: e.target.value }))}
            className={inputClass}
          >
            {LETTER_CASE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </AdminField>
      )}
      <AdminField label="Excluded Characters">
        <input
          value={form.excluded_chars}
          onChange={(e) => setForm((prev) => ({ ...prev, excluded_chars: e.target.value }))}
          className={inputClass}
          placeholder="O0I1L"
        />
      </AdminField>
      {showLetters && (
        <AdminField label={segmentType === 'alpha' ? 'Length (letters)' : 'Number of Letters'}>
          <input
            type="number"
            min={segmentType === 'alpha' ? 1 : 0}
            max={10}
            value={form.num_letters}
            onChange={(e) => setForm((prev) => ({ ...prev, num_letters: Number(e.target.value) }))}
            className={inputClass}
          />
        </AdminField>
      )}
      {showDigits && (
        <AdminField label={segmentType === 'numeric' ? 'Length (digits)' : 'Number of Digits'}>
          <input
            type="number"
            min={segmentType === 'numeric' ? 1 : 0}
            max={10}
            value={form.num_digits}
            onChange={(e) => setForm((prev) => ({ ...prev, num_digits: Number(e.target.value) }))}
            className={inputClass}
          />
        </AdminField>
      )}
      <AdminField label="Seed Value">
        <input
          type="number"
          min={1}
          value={form.seed_value}
          onChange={(e) => setForm((prev) => ({ ...prev, seed_value: Number(e.target.value) }))}
          className={inputClass}
        />
      </AdminField>
      <div className="flex items-end pb-2">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
            className="rounded border-gray-600 bg-gray-800"
          />
          Active
        </label>
      </div>
      <div className="md:col-span-2 rounded border border-gray-700 bg-gray-800/60 p-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">ID Format Preview</p>
        <p className="mt-1 text-sm text-gray-300">
          Format: {form.table_abbreviation || 'ABC'}{form.separator ?? '-'}{formatPreviewPattern(form)}
          {form.suffix ? form.suffix : ''}
        </p>
        <p className="mt-1 font-mono text-base text-blue-200">
          Example:{' '}
          <span>{previewParts.prefix}</span>
          {previewParts.code ? (
            <Link
              to={generatedIdsSearchPath}
              className="rounded bg-blue-900/40 px-1 text-blue-100 underline decoration-blue-400/60 underline-offset-2 hover:text-white"
              title="Search generated IDs for this table by code reference (the part after the prefix)"
            >
              {previewParts.code}
            </Link>
          ) : (
            preview
          )}
        </p>
        {form.target_table && (
          <p className="mt-2 text-xs text-gray-500">
            Click the highlighted code reference to search generated IDs for{' '}
            <span className="font-mono text-gray-400">{form.target_table}</span>
            {' '}(match the segment after the prefix, e.g.{' '}
            <span className="font-mono text-gray-400">8BF9Y25</span>
            {' '}in{' '}
            <span className="font-mono text-gray-400">SUB-8BF9Y25</span>
            ).
          </p>
        )}
      </div>
      <div className={`md:col-span-2 rounded border p-3 ${capacityBlocked ? 'border-red-700 bg-red-950/30' : 'border-gray-700 bg-gray-800/60'}`}>
        <p className="text-xs uppercase tracking-wide text-gray-500">Capacity</p>
        <p className="mt-1 text-sm text-gray-300">
          {capacityLoading && form.target_table
            ? 'Calculating capacity...'
            : `~${formatKeyspaceSize(localKeyspace)} unique IDs`}
        </p>
        {form.target_table && capacity && !capacityLoading && (
          <p className={`mt-1 text-sm ${capacityBlocked ? 'text-red-300' : usagePct >= 70 ? 'text-amber-200' : 'text-gray-400'}`}>
            {neededCount.toLocaleString()} of {formatKeyspaceSize(capacity.keyspace_size)} already needed
            {usagePct != null ? ` (${usagePct}% of keyspace)` : ''}
          </p>
        )}
        {capacityBlocked && (
          <p className="mt-2 text-sm text-red-300">
            This format cannot cover the table&apos;s current volume. Increase letters/digits, remove excluded characters, or switch to mixed letter case before saving.
          </p>
        )}
        {!form.target_table && (
          <p className="mt-1 text-xs text-gray-500">Select a target table to compare capacity against current row count.</p>
        )}
      </div>
    </div>
  )
}
