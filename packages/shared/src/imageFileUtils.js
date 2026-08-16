/**
 * Generic image file normalisation + clipboard-paste handling (v207), mirroring
 * the monorepo's packages/shared/src/utils/imageFileUtils.js for parity.
 */

function guessImageMime(file) {
  if (file?.type && String(file.type).startsWith('image/')) return file.type
  const name = String(file?.name || '').toLowerCase()
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.svg') || name.endsWith('.svg+xml')) return 'image/svg+xml'
  return 'image/png'
}

export function normalizeImageFile(file, fallbackName = 'pasted-image.png') {
  if (!file) return null
  const type = guessImageMime(file)
  const name = file.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)
    ? file.name
    : fallbackName
  if (file.type === type && file.name === name) return file
  return new File([file], name, { type })
}

export function fileFromDataUrl(dataUrl, fallbackName = 'pasted-image') {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  const mime = match[1]
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png'
  return new File([bytes], `${fallbackName}.${ext}`, { type: mime })
}

function isLikelyImageItem(item) {
  if (!item || item.kind !== 'file') return false
  const type = String(item.type || '')
  return type.startsWith('image/') || type === ''
}

/**
 * Convert a paste event's clipboardData into an image File, or null.
 * Handles Windows/Chrome quirks: empty MIME types, HTML <img> data URLs, files list.
 */
export async function fileFromClipboardData(clipboardData, fallbackName = 'pasted-image') {
  if (!clipboardData) return null

  const items = clipboardData.items
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (!isLikelyImageItem(item)) continue
      const file = item.getAsFile?.()
      if (file) return normalizeImageFile(file, `${fallbackName}.png`)
    }
  }

  const files = clipboardData.files
  if (files) {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]
      if (!file) continue
      const type = String(file.type || '')
      if (type.startsWith('image/') || type === '') return normalizeImageFile(file, `${fallbackName}.png`)
    }
  }

  const html = typeof clipboardData.getData === 'function' ? clipboardData.getData('text/html') : ''
  const srcMatch = String(html).match(/<img[^>]+src=["']([^"']+)["']/i)
  if (srcMatch?.[1]?.startsWith('data:image/')) {
    return fileFromDataUrl(srcMatch[1], fallbackName)
  }
  if (srcMatch?.[1]?.startsWith('blob:')) {
    try {
      const blob = await fetch(srcMatch[1]).then((r) => r.blob())
      if (blob && String(blob.type || '').startsWith('image/')) {
        return normalizeImageFile(new File([blob], `${fallbackName}.png`, { type: blob.type }))
      }
    } catch {
      return null
    }
  }

  const plain = typeof clipboardData.getData === 'function' ? clipboardData.getData('text/plain') : ''
  if (String(plain).startsWith('data:image/')) return fileFromDataUrl(plain, fallbackName)

  return null
}
