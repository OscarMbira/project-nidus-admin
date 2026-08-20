import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, Trash2, Upload } from 'lucide-react'
import {
  getAdminAvatar,
  saveAdminAvatar,
  removeAdminAvatar,
  validateAdminAvatarFile,
  normalizeImageFile,
  fileFromClipboardData,
} from '@nidus-admin/shared'
import { AdminActionButton } from './AdminActionButton.jsx'
import { useToast } from './AdminToast.jsx'
import { AdminAvatarBadge } from './AdminAvatarBadge.jsx'

/**
 * "Profile Picture" section for the Admin Profile page (v207). Saves immediately
 * on upload/paste/remove — mirrors the monorepo's ProfilePictureSection.
 */
export function AdminProfilePictureSection({ initials }) {
  const [avatarPath, setAvatarPath] = useState(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [showPasteHint, setShowPasteHint] = useState(false)
  const [busy, setBusy] = useState(false)
  const pasteBoxRef = useRef(null)
  const { showSuccess, showError } = useToast()

  useEffect(() => {
    let cancelled = false
    getAdminAvatar().then((result) => {
      if (cancelled) return
      if (result.success) setAvatarPath(result.data)
    })
    return () => { cancelled = true }
  }, [])

  const applyFile = async (file) => {
    const normalized = normalizeImageFile(file, 'profile-picture.png')
    const validationError = validateAdminAvatarFile(normalized)
    if (validationError) {
      showError(validationError)
      return
    }
    setBusy(true)
    try {
      const result = await saveAdminAvatar(normalized)
      if (!result.success) {
        showError(result.message || 'Failed to save profile picture')
        return
      }
      setAvatarPath(result.data)
      setRefreshNonce((n) => n + 1)
      setShowPasteHint(false)
      showSuccess('Profile picture updated')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setBusy(true)
    try {
      const result = await removeAdminAvatar()
      if (!result.success) {
        showError(result.message || 'Failed to remove profile picture')
        return
      }
      setAvatarPath(null)
      showSuccess('Profile picture removed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!showPasteHint) return undefined
    const applyPaste = async (event) => {
      event.preventDefault()
      event.stopPropagation()
      const file = await fileFromClipboardData(event.clipboardData, 'profile-picture')
      if (!file) {
        showError('Clipboard does not contain an image. Copy an image, then paste again.')
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
      <h3 className="mb-3 text-sm font-semibold text-gray-100">Profile Picture</h3>
      <div className="flex flex-wrap items-center gap-4">
        <AdminAvatarBadge avatarPath={avatarPath} initials={initials} sizeClassName="h-20 w-20" zoomable refreshNonce={refreshNonce} />
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded border border-gray-600 bg-gray-800/60 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
            <Upload className="h-3.5 w-3.5" />
            {busy ? 'Saving…' : 'Upload'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
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
          {avatarPath && (
            <AdminActionButton variant="danger" disabled={busy} onClick={handleRemove} className="inline-flex items-center gap-1.5 !px-3 !py-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </AdminActionButton>
          )}
        </div>
      </div>
      {showPasteHint && (
        <div
          ref={pasteBoxRef}
          tabIndex={0}
          role="textbox"
          aria-label="Paste profile picture"
          className="mt-3 rounded-md border border-dashed border-gray-600 bg-gray-800/60 px-3 py-2 text-xs text-gray-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          Copy an image, click this box, then press Ctrl+V (or Cmd+V).
        </div>
      )}
      <p className="mt-2 text-[11px] text-gray-500">PNG, JPEG, GIF, or WEBP — up to 2MB.</p>
    </div>
  )
}

export default AdminProfilePictureSection
