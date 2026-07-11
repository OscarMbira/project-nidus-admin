import { useEffect, useMemo, useState } from 'react'
import { fetchGuidedTours, fetchHelpArticles } from '@nidus-admin/shared'
import { AdminBadge, AdminCard, AdminTable, EmptyState, LoadingState, SearchBar } from '@nidus-admin/ui'

export default function HelpManagementPage() {
  const [articles, setArticles] = useState([])
  const [tours, setTours] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError(null)
    const [articlesRes, toursRes] = await Promise.all([
      fetchHelpArticles(),
      fetchGuidedTours(),
    ])
    if (articlesRes.error || toursRes.error) {
      setError(articlesRes.error?.message || toursRes.error?.message || 'Failed to load help content.')
      setArticles([])
      setTours([])
    } else {
      setArticles(articlesRes.data || [])
      setTours(toursRes.data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredArticles = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return articles
    return articles.filter((row) => [row.title, row.slug, row.excerpt, row.role, row.methodology]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [articles, search])

  const filteredTours = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return tours
    return tours.filter((row) => [row.tour_name, row.tour_key, row.description, row.target_role, row.target_page]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [tours, search])

  if (loading) return <LoadingState message="Loading help content..." />
  if (error) return <div className="p-4 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Help Management</h1>
        <p className="text-sm text-gray-500">Help articles and guided tours shown to Platform users.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Help articles" value={articles.length} />
        <AdminCard title="Published" value={articles.filter((row) => row.is_published).length} />
        <AdminCard title="Featured" value={articles.filter((row) => row.featured).length} />
        <AdminCard title="Guided tours" value={tours.length} />
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search articles and tours..." />

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-gray-200">Help articles</h2>
        {filteredArticles.length === 0 ? (
          <EmptyState title="No help articles" description="Run pnpm run admin:seed-content to load seed data." />
        ) : (
          <AdminTable
            columns={[
              { key: 'title', label: 'Title', render: (row) => row.title },
              { key: 'slug', label: 'Slug', render: (row) => row.slug },
              { key: 'role', label: 'Role', render: (row) => row.role || 'all' },
              { key: 'methodology', label: 'Methodology', render: (row) => row.methodology || 'all' },
              { key: 'is_published', label: 'Status', render: (row) => <AdminBadge label={row.is_published ? 'published' : 'draft'} variant={row.is_published ? 'active' : 'default'} /> },
            ]}
            rows={filteredArticles}
            idKey="id"
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-gray-200">Guided tours</h2>
        {filteredTours.length === 0 ? (
          <EmptyState title="No guided tours" description="Guided tour seed data loads with admin:seed-content." />
        ) : (
          <AdminTable
            columns={[
              { key: 'tour_name', label: 'Tour', render: (row) => row.tour_name },
              { key: 'tour_key', label: 'Key', render: (row) => row.tour_key },
              { key: 'target_page', label: 'Page', render: (row) => row.target_page },
              { key: 'trigger_type', label: 'Trigger', render: (row) => row.trigger_type },
              { key: 'is_active', label: 'Status', render: (row) => <AdminBadge label={row.is_active ? 'active' : 'inactive'} variant={row.is_active ? 'active' : 'default'} /> },
            ]}
            rows={filteredTours}
            idKey="id"
          />
        )}
      </section>
    </div>
  )
}
