import { useAdminAuth } from '../../context/AdminAuthContext.jsx'
import { AdminProfilePictureSection, AdminProfileSignatureSection } from '@nidus-admin/ui'

function userInitials(adminUser) {
  const name = adminUser?.full_name?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  const email = adminUser?.email || ''
  return email.slice(0, 2).toUpperCase() || 'AD'
}

/**
 * My Profile — Admin's own picture + signature management (v207 plan / monorepo
 * v894 PRD). Admin has no editable Name/Phone/Bio fields today (unlike Platform/
 * Simulator's Settings page), so this page is scoped to just the two new sections.
 */
export default function AdminProfile() {
  const { adminUser, role } = useAdminAuth()

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">My Profile</h1>
        <p className="mt-1 text-sm text-gray-400">
          {adminUser?.full_name || adminUser?.email} · {role}
        </p>
      </div>
      <AdminProfilePictureSection initials={userInitials(adminUser)} />
      <AdminProfileSignatureSection />
    </div>
  )
}
