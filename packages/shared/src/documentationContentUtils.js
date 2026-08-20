function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeHtmlFragment(html) {
  if (typeof DOMParser === 'undefined') return escapeHtml(html)

  const doc = new DOMParser().parseFromString(`<div id="doc-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('doc-root')
  if (!root) return escapeHtml(html)

  root.querySelectorAll('script, iframe, object, embed, form, meta, link, style, base').forEach((el) => {
    el.remove()
  })

  root.querySelectorAll('*').forEach((el) => {
    ;[...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name === 'style') {
        el.removeAttribute(attr.name)
        return
      }
      if ((name === 'href' || name === 'src') && /^javascript:/i.test(attr.value || '')) {
        el.removeAttribute(attr.name)
      }
    })
  })

  return root.innerHTML
}

function isHtmlDocument(content) {
  const trimmed = content.trim()
  return /^<!DOCTYPE/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)
}

function isHtmlFragment(content) {
  const trimmed = content.trim()
  return /^<(h[1-6]|p|div|ul|ol|table|section|article|main|header|blockquote|pre|span)\b/i.test(trimmed)
}

export function isAppShellHtml(content) {
  return /vite\/client|@react-refresh|id="root"|\/src\/main\.(jsx|tsx)/i.test(content)
}

export function detectDocumentationContentType(content = '', fileName = '') {
  const trimmed = content.trim()
  if (!trimmed) return 'markdown'

  const lowerName = String(fileName || '').toLowerCase()
  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) return 'html'
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) return 'markdown'

  if (isHtmlDocument(trimmed) || isHtmlFragment(trimmed)) return 'html'
  return 'markdown'
}

function extractHtmlBody(content) {
  if (!isHtmlDocument(content)) return content.trim()

  if (typeof DOMParser === 'undefined') return content.trim()

  const doc = new DOMParser().parseFromString(content, 'text/html')
  doc.querySelectorAll('script, style, link[rel="stylesheet"], meta, base').forEach((el) => el.remove())
  const bodyHtml = doc.body?.innerHTML?.trim()
  return bodyHtml || content.trim()
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text)
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-gray-800 px-1.5 py-0.5 text-blue-300">$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-gray-100">$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em class="text-gray-200">$1</em>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 underline decoration-blue-500/40 hover:text-blue-300" target="_blank" rel="noreferrer noopener">$1</a>')
  return html
}

function renderMarkdownBlock(block) {
  const trimmed = block.trim()
  if (!trimmed) return ''

  const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
  if (headingMatch) {
    const level = headingMatch[1].length
    const tag = `h${level}`
    const classes = {
      1: 'text-3xl font-bold text-gray-50 mb-4 mt-2',
      2: 'text-2xl font-semibold text-gray-100 mb-3 mt-6 border-b border-gray-800 pb-2',
      3: 'text-xl font-semibold text-gray-100 mb-2 mt-5',
      4: 'text-lg font-medium text-gray-100 mb-2 mt-4',
      5: 'text-base font-medium text-gray-200 mb-2 mt-3',
      6: 'text-sm font-medium uppercase tracking-wide text-gray-400 mb-2 mt-3',
    }[level]
    return `<${tag} class="${classes}">${renderInlineMarkdown(headingMatch[2])}</${tag}>`
  }

  const codeMatch = trimmed.match(/^```(?:[\w-]+)?\n?([\s\S]*?)```$/)
  if (codeMatch) {
    return `<pre class="my-4 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-4 text-sm leading-relaxed text-gray-300"><code>${escapeHtml(codeMatch[1].trim())}</code></pre>`
  }

  const lines = trimmed.split('\n')
  const isUnorderedList = lines.every((line) => /^[-*]\s+/.test(line))
  if (isUnorderedList) {
    const items = lines.map((line) => `<li class="leading-relaxed">${renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`).join('')
    return `<ul class="my-3 list-disc space-y-1 pl-6 text-gray-300">${items}</ul>`
  }

  const isOrderedList = lines.every((line) => /^\d+\.\s+/.test(line))
  if (isOrderedList) {
    const items = lines.map((line) => `<li class="leading-relaxed">${renderInlineMarkdown(line.replace(/^\d+\.\s+/, ''))}</li>`).join('')
    return `<ol class="my-3 list-decimal space-y-1 pl-6 text-gray-300">${items}</ol>`
  }

  const isQuote = lines.every((line) => /^>\s?/.test(line))
  if (isQuote) {
    const quote = lines.map((line) => renderInlineMarkdown(line.replace(/^>\s?/, ''))).join('<br />')
    return `<blockquote class="my-4 border-l-4 border-blue-700/60 bg-gray-950/60 px-4 py-3 text-gray-300">${quote}</blockquote>`
  }

  return `<p class="mb-4 leading-7 text-gray-300">${renderInlineMarkdown(trimmed.replace(/\n/g, ' '))}</p>`
}

export function markdownToDocumentationHtml(content = '') {
  const blocks = String(content).replace(/\r\n/g, '\n').split(/\n{2,}/)
  const html = blocks.map(renderMarkdownBlock).filter(Boolean).join('\n')
  return sanitizeHtmlFragment(html)
}

export function htmlToDocumentationHtml(content = '') {
  const body = extractHtmlBody(content)
  return sanitizeHtmlFragment(body)
}

export function renderDocumentationContent(content = '', options = {}) {
  const fileName = options.fileName || ''
  const type = detectDocumentationContentType(content, fileName)

  if (type === 'html') {
    if (isAppShellHtml(content)) {
      return {
        html: '',
        warning: 'This file looks like an application HTML shell rather than documentation. Re-sync the correct Markdown guide from the module docs folder or edit the guide in Documentation Editor.',
        contentType: 'html',
      }
    }

    return {
      html: htmlToDocumentationHtml(content),
      warning: null,
      contentType: 'html',
    }
  }

  return {
    html: markdownToDocumentationHtml(content),
    warning: null,
    contentType: 'markdown',
  }
}
