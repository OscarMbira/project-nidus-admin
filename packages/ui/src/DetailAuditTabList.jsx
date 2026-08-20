/**
 * Shared tab chrome for a record's detail/edit surface (v866, generalised v871
 * — matches the equivalent generalisation in the monorepo's @nidus/ui copy).
 * Two ways to use it:
 *  - Simple 2-tab shape (most pages): pass detailsLabel/auditLabel as before —
 *    nothing changes for existing callers.
 *  - Arbitrary tab count (pages with more than one content section plus Audit):
 *    pass an explicit `tabs` array instead; it fully overrides the legacy props.
 * @param {{
 *   activeTab: string,
 *   onChange: (tab: string) => void,
 *   tabs?: { value: string, label: string }[] | null,
 *   detailsLabel?: string,
 *   auditLabel?: string,
 *   ariaLabel?: string,
 * }} props
 */
export default function DetailAuditTabList({
  activeTab,
  onChange,
  tabs = null,
  detailsLabel = 'Details',
  auditLabel = 'Audit details',
  ariaLabel = 'Record sections',
}) {
  const resolvedTabs = tabs || [
    { value: 'details', label: detailsLabel },
    { value: 'audit', label: auditLabel },
  ]

  const tabClass = (selected) =>
    `border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
      selected
        ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
        : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
    }`

  return (
    <div
      className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700"
      role="tablist"
      aria-label={ariaLabel}
    >
      {resolvedTabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.value}
          onClick={() => onChange(tab.value)}
          className={tabClass(activeTab === tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
