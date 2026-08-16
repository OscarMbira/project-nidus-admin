import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminProfileSignatureSection } from '../AdminProfileSignatureSection.jsx'

const getAdminSavedSignature = vi.fn()
const saveAdminSignatureImage = vi.fn()
const deleteAdminSavedSignature = vi.fn()
const getAdminSignatureSignedUrl = vi.fn()
const showSuccess = vi.fn()
const showError = vi.fn()

vi.mock('@nidus-admin/shared', () => ({
  getAdminSavedSignature: (...args) => getAdminSavedSignature(...args),
  saveAdminSignatureImage: (...args) => saveAdminSignatureImage(...args),
  deleteAdminSavedSignature: (...args) => deleteAdminSavedSignature(...args),
  getAdminSignatureSignedUrl: (...args) => getAdminSignatureSignedUrl(...args),
  validateAdminSignatureFile: (file) => {
    if (!file) return 'No file selected.'
    if (file.size > 2 * 1024 * 1024) return 'File is too large'
    return null
  },
  normalizeImageFile: (file) => file,
  fileFromClipboardData: vi.fn(),
}))

vi.mock('../AdminToast.jsx', () => ({
  useToast: () => ({ showSuccess, showError }),
}))

function makeFile({ name = 'sig.png', type = 'image/png', size = 1024 } = {}) {
  return new File([new Uint8Array(size)], name, { type })
}

describe('AdminProfileSignatureSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAdminSavedSignature.mockResolvedValue({ success: true, data: null })
  })

  it('shows "No signature saved yet" and an Upload (not Replace) button when none is saved', async () => {
    render(<AdminProfileSignatureSection />)
    expect(await screen.findByText('No signature saved yet.')).toBeInTheDocument()
    expect(screen.getByText('Upload')).toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('shows the saved signature preview and a Replace/Remove pair when one exists', async () => {
    getAdminSavedSignature.mockResolvedValue({
      success: true,
      data: { storage_bucket: 'admin-user-signatures', storage_path: 'auth-1/signature.png' },
    })
    getAdminSignatureSignedUrl.mockResolvedValue({ success: true, data: 'https://signed.example/sig.png' })

    render(<AdminProfileSignatureSection />)

    const img = await screen.findByAltText('Your saved signature')
    expect(img).toHaveAttribute('src', 'https://signed.example/sig.png')
    expect(screen.getByText('Replace')).toBeInTheDocument()
    expect(screen.getByText('Remove')).toBeInTheDocument()
  })

  it('uploads a signature and saves it immediately', async () => {
    saveAdminSignatureImage.mockResolvedValue({
      success: true,
      data: { storage_bucket: 'admin-user-signatures', storage_path: 'auth-1/signature.png' },
    })
    render(<AdminProfileSignatureSection />)
    await screen.findByText('No signature saved yet.')

    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input, { target: { files: [makeFile()] } })

    await waitFor(() => expect(saveAdminSignatureImage).toHaveBeenCalledWith(expect.any(File)))
  })

  it('calls deleteAdminSavedSignature on Remove', async () => {
    getAdminSavedSignature.mockResolvedValue({
      success: true,
      data: { storage_bucket: 'admin-user-signatures', storage_path: 'auth-1/signature.png' },
    })
    getAdminSignatureSignedUrl.mockResolvedValue({ success: true, data: 'https://signed.example/sig.png' })
    deleteAdminSavedSignature.mockResolvedValue({ success: true, data: null })

    render(<AdminProfileSignatureSection />)
    const removeButton = await screen.findByText('Remove')
    fireEvent.click(removeButton)

    await waitFor(() => expect(deleteAdminSavedSignature).toHaveBeenCalled())
  })
})
