import {
  summariseIndustryPlanPayload,
  summarisePortfolioTemplatePayload,
  summariseProgrammeTemplatePayload,
} from '@nidus-admin/shared'
import { ExportRecordMenu } from '@nidus-admin/ui'

function Card({ title, children, count, actions }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200">
          {title}
          {count != null ? <span className="ml-1 text-gray-500">({count})</span> : null}
        </h3>
        {actions || null}
      </div>
      {children}
    </div>
  )
}

function Kv({ label, value }) {
  if (value == null || value === '') {
    return (
      <p className="text-sm text-gray-400">
        <span className="text-gray-500">{label}:</span> —
      </p>
    )
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return (
    <div className="text-sm">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="whitespace-pre-wrap text-gray-300">{text}</p>
    </div>
  )
}

function FieldsDomainView({ payload }) {
  const fields = Array.isArray(payload) ? payload : []
  return (
    <Card title="Fields" count={fields.length}>
      {fields.length === 0 ? (
        <p className="text-sm text-gray-500">No fields defined.</p>
      ) : (
        <ul className="space-y-2">
          {fields.map((f, i) => (
            <li key={`${f.field_code}-${i}`} className="space-y-2 rounded border border-gray-800 px-3 py-2 text-sm text-gray-300">
              <div>
                <span className="font-medium text-gray-100">{f.label || f.field_code}</span>
                <span className="text-gray-500"> · {f.field_code} · {f.field_type || 'text'}</span>
                {f.required ? <span className="text-amber-400"> · required</span> : null}
              </div>
              {f.guidance_text ? <Kv label="Guidance" value={f.guidance_text} /> : null}
              {f.default_value != null && f.default_value !== '' ? (
                <Kv
                  label="Sample default"
                  value={typeof f.default_value === 'string' ? f.default_value : JSON.stringify(f.default_value)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function IndustryPlanView({ payload }) {
  const summary = summariseIndustryPlanPayload(payload)
  if (!summary) {
    return <p className="text-sm text-gray-500">No industry plan payload object.</p>
  }
  return (
    <Card title="Industry plan">
      <ul className="space-y-1 text-sm text-gray-300">
        <li>
          <span className="text-gray-500">Code:</span>{' '}
          {summary.industry_code || '—'}
          {summary.industry_name ? ` · ${summary.industry_name}` : ''}
        </li>
        <li>
          Phases {summary.phases} · Activities {summary.activities} · Deliverables {summary.deliverables}
        </li>
        <li>
          Risks {summary.risks} · Milestones {summary.milestones} · Roles {summary.roles}
        </li>
      </ul>
    </Card>
  )
}

function PortfolioTemplateView({ payload }) {
  const summary = summarisePortfolioTemplatePayload(payload)
  if (!summary) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No portfolio template payload.</p>
  }
  return (
    <Card title="Portfolio template">
      <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
        <li>
          <span className="text-gray-500">Code:</span> {summary.template_code || '—'}
          {summary.portfolio_type ? ` · ${summary.portfolio_type}` : ''}
        </li>
        <li>
          Objectives {summary.objectives} · Governance {summary.governance} · Metrics {summary.metrics}
        </li>
        <li>Risks {summary.risks} · Roles {summary.roles}</li>
      </ul>
    </Card>
  )
}

function ProgrammeTemplateView({ payload }) {
  const summary = summariseProgrammeTemplatePayload(payload)
  if (!summary) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No programme template payload.</p>
  }
  return (
    <Card title="Programme template">
      <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
        <li>
          <span className="text-gray-500">Code:</span> {summary.template_code || '—'}
          {summary.programme_type ? ` · ${summary.programme_type}` : ''}
        </li>
        <li>
          Governance {summary.governance} · Milestones {summary.milestones} · Dependencies {summary.dependencies}
        </li>
        <li>Benefits {summary.benefits} · Risks {summary.risks} · Roles {summary.roles}</li>
      </ul>
    </Card>
  )
}

function FormTemplateView({ payload, templateName, globalTemplateId }) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const schema = p.schema && typeof p.schema === 'object' ? p.schema : {}
  const sections = Array.isArray(schema.sections) ? schema.sections : []
  const fieldCount = sections.reduce((n, s) => n + (Array.isArray(s.fields) ? s.fields.length : 0), 0)

  return (
    <div className="space-y-4">
      <Card title="Form template">
        <div className="grid gap-2 sm:grid-cols-2">
          <Kv label="Template code" value={p.template_code} />
          <Kv label="Process group" value={p.process_group} />
          <Kv label="Active" value={p.is_active === false ? 'No' : 'Yes'} />
          <Kv label="Form title" value={schema.title || p.name} />
        </div>
      </Card>

      <Card
        title="Form layout"
        count={`${sections.length} section(s), ${fieldCount} field(s)`}
        actions={(
          <ExportRecordMenu
            schema={schema}
            templateName={templateName || schema.title || p.name || 'Form Template'}
            templateCode={p.template_code || ''}
            globalTemplateId={globalTemplateId}
            enableRealSubmission={Boolean(globalTemplateId)}
          />
        )}
      >
        {sections.length === 0 ? (
          <p className="text-sm text-gray-500">No sections defined.</p>
        ) : (
          <div className="space-y-3">
            {sections.map((section, sIdx) => (
              <div key={section.key || sIdx} className="rounded border border-gray-200 dark:border-gray-800 p-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {section.title || section.key || `Section ${sIdx + 1}`}
                  <span className="ml-2 text-xs text-gray-500">{section.key}</span>
                </p>
                <ul className="mt-2 space-y-1.5">
                  {(section.fields || []).map((field, fIdx) => (
                    <li key={field.key || fIdx} className="rounded bg-gray-50 dark:bg-gray-950/50 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{field.label || field.key}</span>
                      <span className="text-gray-500"> · {field.key} · {field.type || 'text'}</span>
                      {field.required ? <span className="text-amber-600 dark:text-amber-400"> · required</span> : null}
                      {field.help ? (
                        <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">{field.help}</p>
                      ) : null}
                      {field.sample ? (
                        <p className="mt-1 text-xs text-gray-500">
                          Sample: <span className="text-gray-700 dark:text-gray-300">{field.sample}</span>
                        </p>
                      ) : null}
                      {field.type === 'select' && Array.isArray(field.options) && field.options.length > 0 ? (
                        <p className="mt-1 text-xs text-gray-500">
                          Options:{' '}
                          {field.options.map((o) => (typeof o === 'string' ? o : (o.label || o.value))).join(', ')}
                        </p>
                      ) : null}
                    </li>
                  ))}
                  {(!section.fields || section.fields.length === 0) && (
                    <li className="text-xs text-gray-500">No fields in this section.</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function OpaView({ payload }) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  return (
    <Card title="OPA">
      <div className="grid gap-3 sm:grid-cols-2">
        <Kv label="Title" value={p.title} />
        <Kv label="Type" value={p.opa_type} />
        <Kv label="Version" value={p.version} />
        <Kv label="Status" value={p.status} />
      </div>
      <div className="mt-3 space-y-2">
        <Kv label="Description" value={p.description} />
        <Kv label="Notes" value={p.notes} />
        <Kv
          label="Tags"
          value={Array.isArray(p.tags) && p.tags.length ? p.tags.join(', ') : null}
        />
      </div>
    </Card>
  )
}

function ProcessTemplateView({ payload }) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const data = p.document_data && typeof p.document_data === 'object' && !Array.isArray(p.document_data)
    ? p.document_data
    : {}
  const entries = Object.entries(data)

  return (
    <div className="space-y-4">
      <Card title="Process template">
        <div className="grid gap-2 sm:grid-cols-2">
          <Kv label="Document type" value={p.document_type} />
          <Kv label="Status" value={p.status} />
          <Kv label="Title" value={p.title} />
        </div>
        <div className="mt-2">
          <Kv label="Description" value={p.description} />
        </div>
      </Card>
      <Card title="Document content" count={entries.length}>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">No document content fields.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {entries.map(([key, value]) => (
              <Kv
                key={key}
                label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function LegacyDocumentView({ payload }) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  return (
    <Card title="Legacy document">
      <div className="grid gap-2 sm:grid-cols-2">
        <Kv label="Category" value={p.doc_category} />
        <Kv label="Filename" value={p.original_filename} />
        <Kv label="MIME type" value={p.mime_type} />
        <Kv label="File size" value={p.file_size != null ? String(p.file_size) : null} />
        <Kv label="Storage bucket" value={p.storage_bucket} />
        <Kv label="Storage path" value={p.storage_path} />
      </div>
      <div className="mt-3">
        <Kv label="Extracted text" value={p.extracted_text} />
      </div>
    </Card>
  )
}

function StructuredListView({ payload }) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const rows = Array.isArray(p.rows) ? p.rows : []
  return (
    <div className="space-y-4">
      <Card title="Structured list">
        <Kv label="List type" value={p.list_type} />
      </Card>
      <Card title="Rows" count={rows.length}>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No rows.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row, i) => (
              <li key={i} className="rounded border border-gray-800 px-3 py-2 text-xs text-gray-300">
                <pre className="whitespace-pre-wrap font-mono">{JSON.stringify(row, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/**
 * Domain-aware read-only payload view for Global Template detail.
 * Mirrors the information available on the edit form for each domain.
 */
export default function GlobalTemplatePayloadView({ domain, payload, templateName, globalTemplateId }) {
  switch (domain) {
    case 'industry_plan':
      return <IndustryPlanView payload={payload} />
    case 'portfolio_template':
      return <PortfolioTemplateView payload={payload} />
    case 'programme_template':
      return <ProgrammeTemplateView payload={payload} />
    case 'project_template':
      return <PortfolioTemplateView payload={payload} />
    case 'form_template':
      return (
        <FormTemplateView
          payload={payload}
          templateName={templateName}
          globalTemplateId={globalTemplateId}
        />
      )
    case 'opa':
      return <OpaView payload={payload} />
    case 'process_template':
      return <ProcessTemplateView payload={payload} />
    case 'legacy_document':
      return <LegacyDocumentView payload={payload} />
    case 'structured_list':
      return <StructuredListView payload={payload} />
    case 'fields':
    default:
      return <FieldsDomainView payload={payload} />
  }
}
