/**
 * Admin field-help scope (Admin rule 23) — Admin's own copy of the monorepo FieldHelpScope.
 * Loads the scope's help in one query; a label whose key is not listed asks for it itself, so a page
 * needs no key list (the shell mounts one app-wide scope; a page may add its own with a formKey).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loadAdminFieldHelp } from './adminFieldHelp.js'

const AdminFieldHelpContext = createContext(null)

export function AdminFieldHelpScope({ helpKeys = [], formKey = '', loader = loadAdminFieldHelp, children }) {
  const [requested, setRequested] = useState([])
  const keySignature = [...new Set([...helpKeys, ...requested].filter(Boolean))].sort().join('|')
  const knownRef = useRef(new Set())
  knownRef.current = new Set(keySignature ? keySignature.split('|') : [])
  const [loaded, setLoaded] = useState({ formKey: null, help: {} })

  useEffect(() => {
    let cancelled = false
    const keys = keySignature ? keySignature.split('|') : []
    loader(keys, { formKey })
      .then((help) => { if (!cancelled) setLoaded({ formKey, help }) })
      .catch(() => { if (!cancelled) setLoaded((prev) => (prev.formKey === formKey ? prev : { formKey, help: {} })) })
    return () => { cancelled = true }
  }, [keySignature, formKey, loader])

  const request = useCallback((key) => {
    if (!key || knownRef.current.has(key)) return
    knownRef.current.add(key)
    setRequested((prev) => (prev.includes(key) ? prev : [...prev, key]))
  }, [])

  const value = useMemo(() => ({ help: loaded.formKey === formKey ? loaded.help : {}, request }), [loaded, formKey, request])
  return <AdminFieldHelpContext.Provider value={value}>{children}</AdminFieldHelpContext.Provider>
}

/**
 * The help row for a key, or null (loading, or no help written yet). Inside a scope the scope loads it; with no
 * scope (e.g. a federated module page rendered outside the shell's scope) the label loads its own key — the
 * session cache keeps that to one request per key.
 */
export function useAdminFieldHelp(helpKey) {
  const ctx = useContext(AdminFieldHelpContext)
  const request = ctx?.request
  const [own, setOwn] = useState(null)
  useEffect(() => { if (request && helpKey) request(helpKey) }, [request, helpKey])
  useEffect(() => {
    if (ctx || !helpKey) return undefined
    let cancelled = false
    loadAdminFieldHelp([helpKey]).then((r) => { if (!cancelled) setOwn(r[helpKey] || null) }).catch(() => {})
    return () => { cancelled = true }
  }, [ctx, helpKey])
  if (!helpKey) return null
  if (!ctx) return own
  return ctx.help[helpKey] || null
}

export default AdminFieldHelpContext
