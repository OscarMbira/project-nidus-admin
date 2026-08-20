import { useMemo } from 'react'
import { renderDocumentationContent } from '@nidus-admin/shared'

const PROSE_CLASS = [
  'documentation-content',
  'max-w-none',
  'text-gray-300',
  '[&_a]:text-blue-400',
  '[&_a]:underline',
  '[&_code]:rounded',
  '[&_code]:bg-gray-800',
  '[&_code]:px-1.5',
  '[&_code]:py-0.5',
  '[&_code]:text-blue-300',
  '[&_h1]:text-3xl',
  '[&_h1]:font-bold',
  '[&_h1]:text-gray-50',
  '[&_h2]:text-2xl',
  '[&_h2]:font-semibold',
  '[&_h2]:text-gray-100',
  '[&_h2]:border-b',
  '[&_h2]:border-gray-800',
  '[&_h2]:pb-2',
  '[&_h3]:text-xl',
  '[&_h3]:font-semibold',
  '[&_h3]:text-gray-100',
  '[&_h4]:text-lg',
  '[&_h4]:font-medium',
  '[&_h4]:text-gray-100',
  '[&_li]:leading-relaxed',
  '[&_ol]:my-3',
  '[&_ol]:list-decimal',
  '[&_ol]:pl-6',
  '[&_p]:mb-4',
  '[&_p]:leading-7',
  '[&_pre]:my-4',
  '[&_pre]:overflow-x-auto',
  '[&_pre]:rounded-lg',
  '[&_pre]:border',
  '[&_pre]:border-gray-800',
  '[&_pre]:bg-gray-950',
  '[&_pre]:p-4',
  '[&_pre]:text-sm',
  '[&_table]:my-4',
  '[&_table]:w-full',
  '[&_table]:border-collapse',
  '[&_table]:text-sm',
  '[&_td]:border',
  '[&_td]:border-gray-800',
  '[&_td]:px-3',
  '[&_td]:py-2',
  '[&_th]:border',
  '[&_th]:border-gray-800',
  '[&_th]:bg-gray-950',
  '[&_th]:px-3',
  '[&_th]:py-2',
  '[&_th]:text-left',
  '[&_th]:text-gray-200',
  '[&_ul]:my-3',
  '[&_ul]:list-disc',
  '[&_ul]:pl-6',
].join(' ')

export function DocumentationContentView({ content = '', fileName = '', className = '' }) {
  const rendered = useMemo(
    () => renderDocumentationContent(content, { fileName }),
    [content, fileName],
  )

  if (rendered.warning) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          {rendered.warning}
        </div>
        {!rendered.html ? (
          <p className="text-sm text-gray-500">No readable documentation content was found in this file.</p>
        ) : null}
      </div>
    )
  }

  if (!rendered.html?.trim()) {
    return <p className={`text-sm text-gray-500 ${className}`}>This guide is empty.</p>
  }

  return (
    <div
      className={`${PROSE_CLASS} ${className}`}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  )
}

/** @deprecated Use DocumentationContentView */
export default function MarkdownView(props) {
  return <DocumentationContentView {...props} />
}
