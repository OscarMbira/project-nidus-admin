import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, Trash2, Upload } from 'lucide-react'
import {
  getAdminSavedSignature,
  saveAdminSignatureImage,
  deleteAdminSavedSignature,
  getAdminSignatureSignedUrl,
  peekAdminSignatureDisplayUrl,
  validateAdminSignatureFile,
  normalizeImageFile,
  fileFromClipboardData,
} from '@nidus-admin/shared'
import { AdminActionButton } from './AdminActionButton.jsx'
import { useToast } from './AdminToast.jsx'
import { ZoomableImage } from './ZoomableImage.jsx'

/**
 * "Signature" section for the Admin Profile page (v207) — view/replace/remove
 * the saved signature. No existing Admin approval flow consumes it yet; this
 * ships the management capability so one can wire into it later.
 */
export function AdminProfileSignatureSection() {
  const [saved, setSaved] = useState(null)
  const [signedUrl, setSignedUrl] = useState(null)
  const [showPasteHint, setShowPasteHint] = useState(false)
  const [busy, setBusy] = useState(false)
  const pasteBoxRef = useRef(null)
  const { showSuccess, showError } = useToast()

  useEffect(() => {
    let cancelled = false
    getAdminSavedSignature().then((result) => {
      if (cancelled) return
      if (result.success) setSaved(result.data)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!saved?.storage_path) {
      setSignedUrl(null)
      return undefined
    }
    const cached = peekAdminSignatureDisplayUrl(saved.storage_path)
    if (cached) setSignedUrl(cached)
    getAdminSignatureSignedUrl(saved.storage_path).then((result) => {
      if (!cancelled && result.success) setSignedUrl(result.data)
    })
    return () => { cancelled = true }
  }, [saved])

  const applyFile = async (file) => {
    const normalized = normalizeImageFile(file, 'signature.png')
    const validationError = validateAdminSignatureFile(normalized)
    if (validationError) {
      showError(validationError)
      return
    }
    setBusy(true)
    try {
      const result = await saveAdminSignatureImage(normalized)
      if (!result.success) {
        showError(result.message || 'Failed to save signature')
        return
      }
      setSaved(result.data)
      setShowPasteHint(false)
      showSuccess('Signature updated')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setBusy(true)
    try {
      const result = await deleteAdminSavedSignature()
      if (!result.success) {
        showError(result.message || 'Failed to remove signature')
        return
      }
      setSaved(null)
      setSignedUrl(null)
      showSuccess('Signature removed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!showPasteHint) return undefined
    const applyPaste = async (event) => {
      event.preventDefault()
      event.stopPropagation()
      const file = await fileFromClipboardData(event.clipboardData, 'signature')
      if (!file) {
        showError('Clipboard does not contain an image. Copy a signature image, then paste again.')
        return
      }
      applyFile(file)
    }
    document.addEventListener('paste', applyPaste, true)
    const focusTimer = window.setTimeout(() => pasteBoxRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('paste', applyPaste, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPasteHint])

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-100">Signature</h3>
      <p className="mb-3 text-xs text-gray-400">
        Saved for future use wherever a signature image is needed elsewhere in the system.
      </p>
      {signedUrl ? (
        <div className="mb-3 flex justify-center overflow-visible rounded border border-gray-700 bg-gray-800/60 p-3">
          <ZoomableImage
            src={signedUrl}
            alt="Your saved signature"
            imgClassName="max-h-24 max-w-full object-contain"
            hoverPreviewClassName="max-h-64 max-w-md object-contain"
            priority
          />
        </div>
      ) : (
        <p className="mb-3 text-xs text-gray-500">No signature saved yet.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded border border-gray-600 bg-gray-800/60 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          <Upload className="h-3.5 w-3.5" />
          {busy ? 'Saving…' : saved ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) applyFile(file)
            }}
          />
        </label>
        <AdminActionButton disabled={busy} onClick={() => setShowPasteHint(true)} className="inline-flex items-center gap-1.5 !px-3 !py-1.5">
          <ClipboardPaste className="h-3.5 w-3.5" />
          Paste
        </AdminActionButton>
        {saved && (
          <AdminActionButton variant="danger" disabled={busy} onClick={handleRemove} className="inline-flex items-center gap-1.5 !px-3 !py-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </AdminActionButton>
        )}
      </div>
      {showPasteHint && (
        <div
          ref={pasteBoxRef}
          tabIndex={0}
          role="textbox"
          aria-label="Paste signature image"
          className="mt-3 rounded-md border border-dashed border-gray-600 bg-gray-800/60 px-3 py-2 text-xs text-gray-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          Copy a signature image, click this box, then press Ctrl+V (or Cmd+V).
        </div>
      )}
      <p className="mt-2 text-[11px] text-gray-500">PNG, JPEG, GIF, SVG, or WEBP — up to 2MB.</p>
    </div>
  )
}

export default AdminProfileSignatureSection
