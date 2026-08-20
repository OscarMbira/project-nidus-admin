import { describe, expect, it } from 'vitest'
import {
  detectDocumentationContentType,
  isAppShellHtml,
  markdownToDocumentationHtml,
  renderDocumentationContent,
} from '../documentationContentUtils.js'

describe('documentationContentUtils', () => {
  it('detects markdown and html content types', () => {
    expect(detectDocumentationContentType('# Title\n\nBody', 'Guide.md')).toBe('markdown')
    expect(detectDocumentationContentType('<h1>Title</h1><p>Body</p>', 'Guide.html')).toBe('html')
  })

  it('renders markdown into readable html', () => {
    const html = markdownToDocumentationHtml('# Platform Console\n\nRead-only views.\n\n- Projects\n- Users')
    expect(html).toContain('<h1')
    expect(html).toContain('Platform Console')
    expect(html).toContain('<ul')
    expect(html).toContain('Projects')
  })

  it('warns when an app shell html file is uploaded', () => {
    const shell = '<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>'
    expect(isAppShellHtml(shell)).toBe(true)
    expect(renderDocumentationContent(shell, { fileName: 'index.html' }).warning).toMatch(/application HTML shell/)
  })
})
