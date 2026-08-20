import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchAvailableTables,
  fetchIdGenerationRuleById,
  fetchIdGenerationRuleByTargetTable,
  fetchIdGenerationRules,
  findIdGenerationRuleForTable,
  idGenerationRuleFormPath,
  normalizeTargetTable,
  targetTablesMatch,
} from '@nidus-admin/shared'

/**
 * Resolves ID generation rule form mode from loaded rule data (not URL alone).
 * ?id= loads by id; ?table= resolves via normalized server lookup.
 */
export function useIdGenerationRuleFormMode() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ruleIdFromUrl = searchParams.get('id')
  const isViewOnly = searchParams.get('view') === '1' && Boolean(ruleIdFromUrl)
  const presetTable = searchParams.get('table')
    ? normalizeTargetTable(searchParams.get('table'))
    : ''

  const [catalogLoading, setCatalogLoading] = useState(true)
  const [ruleLoading, setRuleLoading] = useState(true)
  const [ruleError, setRuleError] = useState(null)
  const [rule, setRule] = useState(null)
  const [tables, setTables] = useState([])
  const [existingRules, setExistingRules] = useState([])

  useEffect(() => {
    let cancelled = false

    const loadCatalog = async () => {
      setCatalogLoading(true)
      const [tablesRes, rulesRes] = await Promise.all([
        fetchAvailableTables(),
        fetchIdGenerationRules({ limit: 5000 }),
      ])
      if (cancelled) return
      setTables(tablesRes.data || [])
      setExistingRules(rulesRes.data || [])
      setCatalogLoading(false)
    }

    loadCatalog()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false

    const resolveRule = async () => {
      if (catalogLoading) return

      setRuleLoading(true)
      setRuleError(null)

      try {
        if (ruleIdFromUrl) {
          const { data, error } = await fetchIdGenerationRuleById(ruleIdFromUrl)
          if (cancelled) return
          if (error || !data) {
            setRule(null)
            setRuleError(error?.message || String(error) || 'ID generation rule not found.')
          } else {
            setRule(data)
          }
          return
        }

        if (presetTable) {
          if (rule?.id && targetTablesMatch(rule.target_table, presetTable)) {
            if (!ruleIdFromUrl) {
              navigate(idGenerationRuleFormPath({ rule }), { replace: true })
            }
            return
          }

          let resolved = findIdGenerationRuleForTable(existingRules, presetTable)
          if (!resolved?.id) {
            const { data, error } = await fetchIdGenerationRuleByTargetTable(presetTable)
            if (cancelled) return
            if (error) {
              setRule(null)
              setRuleError(error)
              return
            }
            resolved = data
          }

          if (cancelled) return
          setRule(resolved || null)

          if (resolved?.id) {
            navigate(idGenerationRuleFormPath({ rule: resolved }), { replace: true })
          }
          return
        }

        if (cancelled) return
        setRule(null)
      } finally {
        if (!cancelled) setRuleLoading(false)
      }
    }

    resolveRule()
    return () => { cancelled = true }
  }, [ruleIdFromUrl, presetTable, catalogLoading, existingRules, navigate, rule?.id, rule?.target_table])

  const resolveRuleForTable = useCallback(async (targetTable) => {
    const normalized = normalizeTargetTable(targetTable)
    if (!normalized) return null

    const fromCatalog = findIdGenerationRuleForTable(existingRules, normalized)
    if (fromCatalog?.id) return fromCatalog

    const { data, error } = await fetchIdGenerationRuleByTargetTable(normalized)
    if (error) return null
    return data ?? null
  }, [existingRules])

  const adoptRule = useCallback((nextRule) => {
    if (!nextRule?.id) return
    setRule(nextRule)
    setRuleError(null)
    navigate(idGenerationRuleFormPath({ rule: nextRule }), { replace: true })
  }, [navigate])

  const isEdit = Boolean(rule?.id)
  const ruleId = rule?.id || null
  const loading = catalogLoading || ruleLoading
  const resolutionComplete = !catalogLoading && !ruleLoading

  return {
    isEdit,
    isViewOnly,
    loading,
    resolutionComplete,
    ruleError,
    rule,
    ruleId,
    tables,
    existingRules,
    catalogLoading,
    presetTable,
    resolveRuleForTable,
    adoptRule,
    findRuleForTable: (targetTable) => findIdGenerationRuleForTable(existingRules, targetTable),
  }
}
