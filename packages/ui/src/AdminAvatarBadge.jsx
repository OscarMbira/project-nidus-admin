import { useEffect, useState } from 'react'
import { getAdminAvatarSignedUrl } from '@nidus-admin/shared'
import { ZoomableImage } from './ZoomableImage.jsx'

/**
 * Header/profile avatar badge (v207). Renders the admin's uploaded picture via a
 * signed URL (the storage bucket is private) or falls back to the existing
 * initials gradient circle when no picture is set — same markup/classes as the
 * pre-v207 initials-only badge in AdminHeader, so admins without a picture see
 * no visual change.
 */
export function AdminAvatarBadge({ avatarPath, initials, sizeClassName = 'h-8 w-8', zoomable = false }) {
  const [signedUrl, setSignedUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    setSignedUrl(null)
    if (!avatarPath) return undefined
    getAdminAvatarSignedUrl(avatarPath).then((result) => {
      if (!cancelled && result.success) setSignedUrl(result.data)
    })
    return () => { cancelled = true }
  }, [avatarPath])

  if (signedUrl) {
    const imgClassName = `${sizeClassName} rounded-full object-cover shadow-md`
    if (zoomable) {
      return (
        <ZoomableImage
          src={signedUrl}
          alt="Your profile picture"
          imgClassName={imgClassName}
          hoverPreviewClassName="h-48 w-48 rounded-full object-cover"
        />
      )
    }
    return (
      <img
        src={signedUrl}
        alt="Your profile picture"
        className={imgClassName}
      />
    )
  }

  return (
    <div className={`flex ${sizeClassName} items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-semibold text-white shadow-md`}>
      {initials}
    </div>
  )
}

export default AdminAvatarBadge
