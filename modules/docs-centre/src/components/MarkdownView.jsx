function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function MarkdownView({ content = '' }) {
  let html = escapeHtml(content)
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-medium text-gray-100 mt-4 mb-2">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-gray-100 mt-6 mb-3">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-gray-50 mb-4">$1</h1>')
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-gray-800 px-1 text-blue-300">$1</code>')
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="my-4 overflow-x-auto rounded-lg bg-gray-950 p-4 text-sm text-gray-300"><code>$1</code></pre>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-gray-100">$1</strong>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:underline" target="_blank" rel="noreferrer">$1</a>')
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-300">$1</li>')
  html = html.replace(/\n\n/g, '</p><p class="text-gray-300 mb-3">')
  html = `<div class="prose-invert max-w-none"><p class="text-gray-300 mb-3">${html}</p></div>`
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
