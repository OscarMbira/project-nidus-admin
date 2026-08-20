import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminField, inputClass, SearchableSelect } from '@nidus-admin/ui'
import {
  DATE_FORMAT_OPTIONS,
  GENERATION_MODE_OPTIONS,
  describeSequentialCapacity,
  fetchScopableColumns,
  previewIdGenerationCapacity,
} from '@nidus-admin/shared'
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
  isAbbreviationDisabled,
  isAbbreviationOptional,
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

const compactInputClass = `${inputClass} h-9 py-1.5 text-sm`

export const EMPTY_ID_RULE_FORM = {
  target_table: '',
  table_abbreviation: '',
  table_description: '',
  separator: '-',
  suffix: '',
  generation_mode: 'random',
  include_date: false,
  date_format: 'YYYY',
  scope_column: '',
  segment_type: 'alphanumeric',
  letter_case: 'uppercase',
  num_letters: DEFAULT_NUM_LETTERS,
  num_digits: DEFAULT_NUM_DIGITS,
  excluded_chars: '',
  seed_value: 1,
  is_active: true,
}

function inferSegmentType(rule) {
  if (rule.generation_mode === 'sequential') return 'numeric'
  if (rule.segment_type) return rule.segment_type
  const letters = Number(rule.num_letters) || 0
  const digits = Number(rule.num_digits) || 0
  if (letters > 0 && digits === 0) return 'alpha'
  if (digits > 0 && letters === 0) return 'numeric'
  return 'alphanumeric'
}

export function ruleToForm(rule) {
  const segmentType = inferSegmentType(rule)
  const sequential = (rule.generation_mode || 'random') === 'sequential'
  return {
    target_table: rule.target_table || '',
    table_abbreviation: rule.table_abbreviation || '',
    table_description: rule.table_description || '',
    separator: rule.separator ?? '-',
    suffix: rule.suffix || '',
    generation_mode: rule.generation_mode || 'random',
    include_date: Boolean(rule.include_date),
    date_format: rule.date_format || 'YYYY',
    scope_column: rule.scope_column || '',
    segment_type: segmentType,
    letter_case: rule.letter_case || 'uppercase',
    num_letters: rule.num_letters ?? (segmentType === 'numeric' ? 0 : DEFAULT_NUM_LETTERS),
    num_digits: rule.num_digits ?? (segmentType === 'alpha' ? 0 : (sequential ? 3 : DEFAULT_NUM_DIGITS)),
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
    next.table_abbreviation = ''
  } else if (segmentType === 'alpha') {
    next.num_digits = 0
    if (!next.num_letters) next.num_letters = DEFAULT_NUM_LETTERS
  } else if (!next.num_letters && !next.num_digits) {
    next.num_letters = DEFAULT_NUM_LETTERS
    next.num_digits = DEFAULT_NUM_DIGITS
  }
  return next
}

function applyGenerationModeChange(prev, generationMode) {
  if (generationMode === 'sequential') {
    return {
      ...prev,
      generation_mode: 'sequential',
      segment_type: 'numeric',
      num_letters: 0,
      num_digits: prev.num_digits || 3,
      excluded_chars: '',
      include_date: prev.include_date ?? false,
      date_format: prev.date_format || 'YYYY',
      scope_column: prev.scope_column || '',
    }
  }

  return {
    ...prev,
    generation_mode: 'random',
    scope_column: '',
    include_date: prev.include_date ?? false,
    date_format: prev.date_format || 'YYYY',
    segment_type: prev.segment_type === 'numeric' && !prev.num_letters ? 'alphanumeric' : (prev.segment_type || 'alphanumeric'),
    num_letters: prev.num_letters || DEFAULT_NUM_LETTERS,
    num_digits: prev.num_digits || DEFAULT_NUM_DIGITS,
  }
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
  const sequential = (form.generation_mode || 'random') === 'sequential'
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
  const [scopableColumns, setScopableColumns] = useState([])
  const [scopableLoading, setScopableLoading] = useState(false)
  const segmentType = form.segment_type || 'alphanumeric'
  const showLetters = !sequential && segmentType !== 'numeric'
  const showDigits = sequential || segmentType !== 'alpha'
  const showLetterCase = !sequential && segmentType !== 'numeric'
  const showRandomFields = !sequential

  useEffect(() => {
    let cancelled = false

    if (!form.target_table) {
      setScopableColumns([])
      return undefined
    }

    setScopableLoading(true)
    fetchScopableColumns(form.target_table).then(({ data, error }) => {
      if (cancelled) return
      setScopableColumns(error ? [] : (data || []))
      setScopableLoading(false)
    })

    return () => { cancelled = true }
  }, [form.target_table])

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
    form.generation_mode,
    form.include_date,
    form.date_format,
    form.scope_column,
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
  const abbreviationOptional = isAbbreviationOptional(form)
  const abbreviationDisabled = isAbbreviationDisabled(form)
  const abbreviationError = useMemo(
    () => getAbbreviationValidationError(form.table_abbreviation, existingRules, excludeRuleId, abbreviationOptional),
    [form.table_abbreviation, existingRules, excludeRuleId, abbreviationOptional],
  )

  const scopeOptions = useMemo(() => {
    const options = [{ value: '', label: 'None (single sequence for whole table)' }]
    for (const column of scopableColumns) {
      options.push({ value: column, label: column })
    }
    if (form.scope_column && !scopableColumns.includes(form.scope_column)) {
      options.push({ value: form.scope_column, label: form.scope_column })
    }
    return options
  }, [scopableColumns, form.scope_column])

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

  const capacitySummary = sequential
    ? describeSequentialCapacity(form)
    : `${formatKeyspaceSize(localKeyspace)} unique IDs`

  const previewCapacitySidebar = (
    <div className="flex flex-col gap-3 lg:sticky lg:top-3 lg:self-start">
      <div className="rounded border border-gray-700 bg-gray-800/60 p-2.5">
        <p className="text-xs uppercase tracking-wide text-gray-500">ID Format Preview</p>
        <p className="mt-1 text-sm text-gray-300">
          Format: {abbreviationOptional && !form.table_abbreviation
            ? ''
            : `${form.table_abbreviation || 'ABC'}${form.separator ?? '-'}`}
          {formatPreviewPattern(form)}
          {form.suffix ? form.suffix : ''}
        </p>
        <p className="mt-1 font-mono text-sm text-blue-200">
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
          <p className="mt-1.5 text-xs leading-snug text-gray-500">
            {sequential
              ? 'Sequential preview uses the seed value and today\'s date when Include date is enabled.'
              : form.include_date
                ? 'Random preview uses today\'s date when Include date is enabled.'
                : (
                  <>
                    Click the highlighted code reference to search generated IDs for{' '}
                    <span className="font-mono text-gray-400">{form.target_table}</span>
                    {' '}(match the segment after the prefix).
                  </>
                )}
          </p>
        )}
      </div>
      <div className={`rounded border p-2.5 ${capacityBlocked ? 'border-red-700 bg-red-950/30' : 'border-gray-700 bg-gray-800/60'}`}>
        <p className="text-xs uppercase tracking-wide text-gray-500">Capacity</p>
        <p className="mt-1 text-sm text-gray-300">
          {capacityLoading && form.target_table
            ? 'Calculating capacity...'
            : capacitySummary}
        </p>
        {form.target_table && capacity && !capacityLoading && (
          <p className={`mt-1 text-xs leading-snug ${capacityBlocked ? 'text-red-300' : usagePct >= 70 ? 'text-amber-200' : 'text-gray-400'}`}>
            {sequential && (form.scope_column || form.include_date)
              ? `Table has ${neededCount.toLocaleString()} rows — capacity is evaluated per scope${form.include_date ? ' × period' : ''}.`
              : `${neededCount.toLocaleString()} of ${formatKeyspaceSize(capacity.keyspace_size)} already needed${usagePct != null ? ` (${usagePct}% of keyspace)` : ''}`}
          </p>
        )}
        {capacityBlocked && (
          <p className="mt-1.5 text-xs leading-snug text-red-300">
            {sequential
              ? 'This sequential format cannot cover the table\'s current row count. Increase sequence width (digits) before saving.'
              : 'This format cannot cover the table\'s current volume. Increase letters/digits, remove excluded characters, or switch to mixed letter case before saving.'}
          </p>
        )}
        {!form.target_table && (
          <p className="mt-1 text-xs text-gray-500">Select a target table to compare capacity against current row count.</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
      <AdminField label="Generation Mode" required>
        <select
          value={form.generation_mode || 'random'}
          onChange={(e) => setForm((prev) => applyGenerationModeChange(prev, e.target.value))}
          className={compactInputClass}
        >
          {GENERATION_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <p className="mt-0.5 text-xs leading-snug text-gray-500">
          {sequential
            ? 'Sequential mode: configure scope, date, and sequence width below.'
            : 'Random mode: alphanumeric codes. Optionally include a date token (e.g. ABD-2026-X7K9M2).'}
        </p>
      </AdminField>
      <div className="hidden md:block" aria-hidden="true" />

      <div className="md:col-span-2 rounded-lg border border-indigo-700/60 bg-indigo-950/20 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
          {sequential ? 'Sequential options' : 'Random options'}
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {sequential ? (
            <AdminField label="Scope To">
              <select
                value={form.scope_column || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, scope_column: e.target.value }))}
                className={compactInputClass}
                disabled={scopableLoading || !form.target_table}
              >
                {scopeOptions.map((option) => (
                  <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-0.5 text-xs leading-snug text-gray-500">
                {!form.target_table
                  ? 'Select a database table first to load FK columns.'
                  : scopableLoading
                    ? 'Loading FK columns...'
                    : 'Reset the sequence counter per parent record (e.g. risk_register_id).'}
              </p>
            </AdminField>
          ) : (
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={Boolean(form.include_date)}
                  onChange={(e) => setForm((prev) => ({
                    ...prev,
                    include_date: e.target.checked,
                    date_format: prev.date_format || 'YYYY',
                  }))}
                  className="rounded border-gray-600 bg-gray-800"
                />
                Include date in ID
              </label>
            </div>
          )}
          <AdminField label="Date Format">
            <select
              value={form.date_format || 'YYYY'}
              onChange={(e) => setForm((prev) => ({ ...prev, date_format: e.target.value }))}
              className={compactInputClass}
              disabled={!form.include_date}
            >
              {DATE_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-0.5 text-xs leading-snug text-gray-500">
              {form.include_date
                ? 'Date token inserted between prefix and code (e.g. 2026).'
                : 'Enable Include date below to activate date formatting.'}
            </p>
          </AdminField>
          {sequential && (
          <div className="flex items-end pb-1 md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(form.include_date)}
                onChange={(e) => setForm((prev) => ({
                  ...prev,
                  include_date: e.target.checked,
                  date_format: prev.date_format || 'YYYY',
                }))}
                className="rounded border-gray-600 bg-gray-800"
              />
              Include date in ID
            </label>
          </div>
          )}
        </div>
      </div>

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
      <AdminField label="Table Abbreviation" required={!abbreviationOptional}>
        <input
          value={form.table_abbreviation}
          maxLength={4}
          disabled={abbreviationDisabled}
          onChange={(e) => setForm((prev) => ({
            ...prev,
            table_abbreviation: e.target.value.toUpperCase().replace(/[^A-Z]/g, ''),
          }))}
          className={`${compactInputClass} disabled:opacity-50 disabled:cursor-not-allowed${abbreviationError ? ' border-red-600 focus:border-red-500' : ''}`}
          placeholder={abbreviationDisabled ? 'Not used for numeric IDs' : (abbreviationOptional ? 'Optional, e.g. RCC' : 'ABD')}
          aria-invalid={Boolean(abbreviationError)}
        />
        {abbreviationDisabled ? (
          <p className="mt-0.5 text-xs leading-snug text-gray-500">
            Numeric IDs can omit a prefix.
          </p>
        ) : abbreviationOptional ? (
          <p className="mt-0.5 text-xs leading-snug text-gray-500">
            Optional for sequential numeric IDs.
          </p>
        ) : abbreviationError ? (
          <p className="mt-0.5 text-xs leading-snug text-red-300">{abbreviationError}</p>
        ) : (
          <p className="mt-0.5 text-xs leading-snug text-gray-500">
            Unique across all ID rules.
          </p>
        )}
      </AdminField>
      <div className="md:col-span-2">
        <AdminField label="Table Description">
          <input
            value={form.table_description}
            onChange={(e) => setForm((prev) => ({ ...prev, table_description: e.target.value }))}
            className={compactInputClass}
          />
        </AdminField>
      </div>
      <AdminField label="Separator">
        <input
          value={form.separator}
          maxLength={2}
          onChange={(e) => setForm((prev) => ({ ...prev, separator: e.target.value }))}
          className={compactInputClass}
          placeholder="-"
        />
      </AdminField>
      <AdminField label="Suffix">
        <input
          value={form.suffix}
          onChange={(e) => setForm((prev) => ({ ...prev, suffix: e.target.value }))}
          className={compactInputClass}
        />
      </AdminField>
      {showRandomFields && (
        <AdminField label="ID Type" required>
          <select
            value={segmentType}
            onChange={(e) => setForm((prev) => applySegmentTypeChange(prev, e.target.value))}
            className={compactInputClass}
          >
            {SEGMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </AdminField>
      )}
      {showLetterCase && (
        <AdminField label="Letter Case">
          <select
            value={form.letter_case}
            onChange={(e) => setForm((prev) => ({ ...prev, letter_case: e.target.value }))}
            className={compactInputClass}
          >
            {LETTER_CASE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </AdminField>
      )}
      {showRandomFields && (
        <AdminField label="Excluded Characters">
          <input
            value={form.excluded_chars}
            onChange={(e) => setForm((prev) => ({ ...prev, excluded_chars: e.target.value }))}
            className={compactInputClass}
            placeholder="O0I1L"
          />
        </AdminField>
      )}
      {showLetters && (
        <AdminField label={segmentType === 'alpha' ? 'Length (letters)' : 'Number of Letters'}>
          <input
            type="number"
            min={segmentType === 'alpha' ? 1 : 0}
            max={10}
            value={form.num_letters}
            onChange={(e) => setForm((prev) => ({ ...prev, num_letters: Number(e.target.value) }))}
            className={compactInputClass}
          />
        </AdminField>
      )}
      {showDigits && (
        <AdminField label={sequential ? 'Sequence Width (digits)' : (segmentType === 'numeric' ? 'Length (digits)' : 'Number of Digits')}>
          <input
            type="number"
            min={1}
            max={10}
            value={form.num_digits}
            onChange={(e) => setForm((prev) => ({ ...prev, num_digits: Number(e.target.value) }))}
            className={compactInputClass}
          />
        </AdminField>
      )}
      <AdminField label="Seed Value">
        <input
          type="number"
          min={1}
          value={form.seed_value}
          onChange={(e) => setForm((prev) => ({ ...prev, seed_value: Number(e.target.value) }))}
          className={compactInputClass}
        />
        {sequential && (
          <p className="mt-0.5 text-xs leading-snug text-gray-500">First ID in each scope/period starts here.</p>
        )}
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
      </div>
      {previewCapacitySidebar}
    </div>
  )
}
