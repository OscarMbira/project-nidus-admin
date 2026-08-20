const OPA_TYPES = [
  'template', 'guideline', 'standard', 'procedure', 'policy',
  'historical_info', 'lessons_learned', 'other',
]

export default function OpaPayloadEditor({ value, onChange }) {
  const v = value || {}
  const set = (patch) => onChange({ ...v, ...patch })

  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-300">
        Title
        <input
          value={v.title || ''}
          onChange={(e) => set({ title: e.target.value })}
          className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-300">
        Description
        <textarea
          value={v.description || ''}
          onChange={(e) => set({ description: e.target.value })}
          rows={3}
          className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm text-gray-300">
          Type
          <select
            value={v.opa_type || 'template'}
            onChange={(e) => set({ opa_type: e.target.value })}
            className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
          >
            {OPA_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-gray-300">
          Version
          <input
            value={v.version || '1.0'}
            onChange={(e) => set({ version: e.target.value })}
            className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-300">
          Status
          <select
            value={v.status || 'active'}
            onChange={(e) => set({ status: e.target.value })}
            className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
          >
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
            <option value="deprecated">deprecated</option>
          </select>
        </label>
      </div>
      <label className="block text-sm text-gray-300">
        Notes
        <textarea
          value={v.notes || ''}
          onChange={(e) => set({ notes: e.target.value })}
          rows={2}
          className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2"
        />
      </label>
    </div>
  )
}

export function emptyOpaPayload() {
  return {
    title: '',
    description: '',
    opa_type: 'template',
    version: '1.0',
    status: 'active',
    tags: [],
    notes: '',
  }
}

export function normalizeOpaPayload(payload) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  return { ...emptyOpaPayload(), ...p }
}
