import { useEffect, useMemo, useState } from 'react'
import {
  deleteTranslation,
  fetchSupportedLanguages,
  fetchTranslationKeys,
  fetchTranslations,
  upsertTranslation,
} from '@nidus-admin/shared'
import {
  AdminIconActionButton,
  EmptyState,
  inputClass,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

export default function TranslationEditorPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [keys, setKeys] = useState([])
  const [translations, setTranslations] = useState([])
  const [languages, setLanguages] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedLanguage, setSelectedLanguage] = useState('')
  const [drafts, setDrafts] = useState({})
  const [savingKeyId, setSavingKeyId] = useState('')
  const [busyTranslationId, setBusyTranslationId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [keysRes, translationsRes, languagesRes] = await Promise.all([
      fetchTranslationKeys(),
      fetchTranslations(),
      fetchSupportedLanguages({ filters: [{ op: 'eq', col: 'is_active', val: true }] }),
    ])
    if (keysRes.error) showError(keysRes.error.message || String(keysRes.error))
    else setKeys(keysRes.data || [])
    if (translationsRes.error) showError(translationsRes.error.message || String(translationsRes.error))
    else setTranslations(translationsRes.data || [])
    if (languagesRes.error) showError(languagesRes.error.message || String(languagesRes.error))
    else {
      const langs = languagesRes.data || []
      setLanguages(langs)
      if (!selectedLanguage && langs.length) {
        const defaultLang = langs.find((l) => l.is_default) || langs[0]
        setSelectedLanguage(defaultLang.language_code)
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const categories = useMemo(() => {
    const set = new Set(keys.map((key) => key.category).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [keys])

  const translationByKeyId = useMemo(() => {
    const map = new Map()
    for (const row of translations) {
      if (row.language_code === selectedLanguage) {
        map.set(row.translation_key_id, row)
      }
    }
    return map
  }, [translations, selectedLanguage])

  const filteredKeys = useMemo(() => {
    const term = search.trim().toLowerCase()
    return keys.filter((key) => {
      if (categoryFilter !== 'all' && key.category !== categoryFilter) return false
      if (!term) return true
      return [key.translation_key, key.default_value, key.context]
        .some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [keys, categoryFilter, search])

  const getDraftValue = (key) => {
    if (drafts[key.id] !== undefined) return drafts[key.id]
    return translationByKeyId.get(key.id)?.translated_value ?? ''
  }

  const setDraftValue = (keyId, value) => {
    setDrafts((prev) => ({ ...prev, [keyId]: value }))
  }

  const handleSave = async (key) => {
    const value = getDraftValue(key).trim()
    if (!selectedLanguage) {
      showError('Select a language first.')
      return
    }
    if (!value) {
      showError('Translation value cannot be empty.')
      return
    }
    setSavingKeyId(key.id)
    const { error } = await upsertTranslation({
      translation_key_id: key.id,
      language_code: selectedLanguage,
      translated_value: value,
      is_reviewed: true,
    })
    setSavingKeyId('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(`Saved ${key.translation_key}.`)
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[key.id]
      return next
    })
    await loadData()
  }

  const handleDelete = (key) => {
    const existing = translationByKeyId.get(key.id)
    if (!existing) {
      showError('No translation exists for this key.')
      return
    }
    confirm({
      title: `Remove translation for ${key.translation_key}?`,
      message: 'The key will fall back to its default value for this language.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyTranslationId(existing.id)
        const { error } = await deleteTranslation(existing.id)
        setBusyTranslationId('')
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Translation removed.')
        setDrafts((prev) => {
          const next = { ...prev }
          delete next[key.id]
          return next
        })
        await loadData()
      },
    })
  }

  const selectedLangMeta = languages.find((l) => l.language_code === selectedLanguage)

  if (loading) return <LoadingState message="Loading translations..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Translation Editor</h1>
          <p className="text-sm text-gray-500">
            Edit localized strings by key
            {selectedLangMeta ? ` for ${selectedLangMeta.language_name} (${selectedLangMeta.completion_percentage ?? 0}% complete)` : ''}.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search keys, defaults..." />
          <select
            className={inputClass}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat === 'all' ? 'All categories' : cat}</option>
            ))}
          </select>
          <select
            className={inputClass}
            value={selectedLanguage}
            onChange={(e) => {
              setSelectedLanguage(e.target.value)
              setDrafts({})
            }}
          >
            {languages.map((lang) => (
              <option key={lang.id} value={lang.language_code}>
                {lang.language_name} ({lang.language_code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {!languages.length ? (
        <EmptyState title="No active languages" description="Add supported languages before editing translations." />
      ) : !filteredKeys.length ? (
        <EmptyState title="No translation keys found" description="Adjust filters or add translation keys in the database." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Default</th>
                <th className="px-4 py-3">Translation</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.map((key) => {
                const existing = translationByKeyId.get(key.id)
                const draft = getDraftValue(key)
                const isDirty = draft !== (existing?.translated_value ?? '')
                return (
                  <tr key={key.id} className="border-t border-gray-800 align-top">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{key.translation_key}</div>
                      {key.context && <div className="mt-1 text-xs text-gray-500">{key.context}</div>}
                    </td>
                    <td className="px-4 py-3">{key.category || '—'}</td>
                    <td className="px-4 py-3 max-w-xs text-gray-400">{key.default_value}</td>
                    <td className="px-4 py-3 min-w-[280px]">
                      <textarea
                        className={`${inputClass} min-h-[72px] text-sm`}
                        value={draft}
                        onChange={(e) => setDraftValue(key.id, e.target.value)}
                        placeholder="Enter translation..."
                      />
                      {existing?.is_reviewed && (
                        <span className="mt-1 inline-block text-xs text-emerald-400">Reviewed</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={savingKeyId === key.id || !isDirty}
                          onClick={() => handleSave(key)}
                          className="rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-60"
                        >
                          {savingKeyId === key.id ? 'Saving...' : 'Save'}
                        </button>
                        <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(key)} disabled={!existing || busyTranslationId === existing?.id} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal}
    </div>
  )
}
