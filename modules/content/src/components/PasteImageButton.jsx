/**
 * v214 — "Paste" alternative to uploading an image file (same behaviour as the Admin profile
 * picture, v207): click Paste, then press Ctrl+V / Cmd+V with an image on the clipboard. The image
 * is handed to onFile as a File; the caller uploads it. Uses the shared clipboard helper, which
 * copes with screenshots, copied browser images and Windows/Chrome quirks.
 */
import { useEffect, useRef, useState } from 'react'
import { fileFromClipboardData } from '@nidus-admin/shared'
import { useToast } from '@nidus-admin/ui'

export default function PasteImageButton({ onFile, disabled = false, label = 'Paste', fileName = 'pasted-image', className = '' }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const { showError } = useToast()

  useEffect(() => {
    if (!open) return undefined
    const onPaste = async (event) => {
      event.preventDefault()
      event.stopPropagation()
      const file = await fileFromClipboardData(event.clipboardData, fileName)
      if (!file) {
        showError('The clipboard does not contain an image. Copy an image, then paste again.')
        return
      }
      setOpen(false)
      onFile(file)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('paste', onPaste, true)
    document.addEventListener('keydown', onKey)
    const focusTimer = window.setTimeout(() => boxRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('paste', onPaste, true)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <span className="inline-flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 ${className}`}
      >
        {open ? 'Cancel paste' : label}
      </button>
      {open && (
        <div
          ref={boxRef}
          tabIndex={0}
          role="textbox"
          aria-label="Paste an image here"
          className="rounded-md border border-dashed border-gray-400 bg-gray-50 px-3 py-2 text-xs text-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-200"
        >
          Copy an image, click this box, then press Ctrl+V (or Cmd+V). Esc to cancel.
        </div>
      )}
    </span>
  )
}
