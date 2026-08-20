import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminProfilePictureSection } from '../AdminProfilePictureSection.jsx'

const getAdminAvatar = vi.fn()
const saveAdminAvatar = vi.fn()
const removeAdminAvatar = vi.fn()
const getAdminAvatarSignedUrl = vi.fn()
const showSuccess = vi.fn()
const showError = vi.fn()

vi.mock('@nidus-admin/shared', () => ({
  getAdminAvatar: (...args) => getAdminAvatar(...args),
  saveAdminAvatar: (...args) => saveAdminAvatar(...args),
  removeAdminAvatar: (...args) => removeAdminAvatar(...args),
  getAdminAvatarSignedUrl: (...args) => getAdminAvatarSignedUrl(...args),
  peekAdminAvatarDisplayUrl: () => null,
  validateAdminAvatarFile: (file) => {
    if (!file) return 'No file selected.'
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      return `File type "${file.type}" is not allowed`
    }
    if (file.size > 2 * 1024 * 1024) return 'File is too large'
    return null
  },
  normalizeImageFile: (file) => file,
  fileFromClipboardData: vi.fn(),
}))

vi.mock('../AdminToast.jsx', () => ({
  useToast: () => ({ showSuccess, showError }),
}))

function makeFile({ name = 'photo.png', type = 'image/png', size = 1024 } = {}) {
  return new File([new Uint8Array(size)], name, { type })
}

describe('AdminProfilePictureSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAdminAvatar.mockResolvedValue({ success: true, data: null })
    getAdminAvatarSignedUrl.mockResolvedValue({ success: false })
  })

  it('shows initials while no picture is set, and no Remove button', async () => {
    render(<AdminProfilePictureSection initials="AD" />)
    expect(await screen.findByText('AD')).toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('uploads a picture and saves it immediately', async () => {
    saveAdminAvatar.mockResolvedValue({ success: true, data: 'auth-1/avatar.png' })
    render(<AdminProfilePictureSection initials="AD" />)
    await screen.findByText('AD')

    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [makeFile()] } })

    await waitFor(() => expect(saveAdminAvatar).toHaveBeenCalledWith(expect.any(File)))
  })

  it('rejects an oversized file before calling saveAdminAvatar', async () => {
    render(<AdminProfilePictureSection initials="AD" />)
    await screen.findByText('AD')

    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [makeFile({ size: 3 * 1024 * 1024 })] } })

    await waitFor(() => expect(saveAdminAvatar).not.toHaveBeenCalled())
  })

  it('shows Remove once a picture is set, and calls removeAdminAvatar on click', async () => {
    getAdminAvatar.mockResolvedValue({ success: true, data: 'auth-1/avatar.png' })
    removeAdminAvatar.mockResolvedValue({ success: true, data: null })
    render(<AdminProfilePictureSection initials="AD" />)

    const removeButton = await screen.findByText('Remove')
    fireEvent.click(removeButton)

    await waitFor(() => expect(removeAdminAvatar).toHaveBeenCalled())
  })
})
