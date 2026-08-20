import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AdminAvatarBadge } from '../AdminAvatarBadge.jsx'

const getAdminAvatarSignedUrl = vi.fn()

vi.mock('@nidus-admin/shared', () => ({
  getAdminAvatarSignedUrl: (...args) => getAdminAvatarSignedUrl(...args),
  peekAdminAvatarDisplayUrl: () => null,
}))

describe('AdminAvatarBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows initials when no avatarPath is set', () => {
    render(<AdminAvatarBadge avatarPath={null} initials="AD" />)
    expect(screen.getByText('AD')).toBeInTheDocument()
    expect(getAdminAvatarSignedUrl).not.toHaveBeenCalled()
  })

  it('shows the signed-URL image once resolved, when avatarPath is set', async () => {
    getAdminAvatarSignedUrl.mockResolvedValue({ success: true, data: 'https://signed.example/avatar.png' })
    render(<AdminAvatarBadge avatarPath="auth-1/avatar.png" initials="AD" />)

    const img = await screen.findByAltText('Your profile picture')
    expect(img).toHaveAttribute('src', 'https://signed.example/avatar.png')
    expect(screen.queryByText('AD')).not.toBeInTheDocument()
  })

  it('makes a zoomable badge clickable to enlarge', async () => {
    getAdminAvatarSignedUrl.mockResolvedValue({ success: true, data: 'https://signed.example/avatar.png' })
    render(<AdminAvatarBadge avatarPath="auth-1/avatar.png" initials="AD" zoomable />)
    await screen.findByAltText('Your profile picture')
    fireEvent.click(screen.getByRole('button', { name: /enlarge your profile picture/i }))
    expect(screen.getByRole('dialog', { name: 'Your profile picture' })).toBeInTheDocument()
  })

  it('falls back to initials if the signed URL request fails', async () => {
    getAdminAvatarSignedUrl.mockResolvedValue({ success: false, message: 'boom' })
    render(<AdminAvatarBadge avatarPath="auth-1/avatar.png" initials="AD" />)

    await waitFor(() => expect(getAdminAvatarSignedUrl).toHaveBeenCalled())
    expect(screen.getByText('AD')).toBeInTheDocument()
  })
})
