import { cleanup, render, screen } from '@testing-library/react'
import { ReceiptScanPreview } from './ReceiptScanPreview'

const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

afterEach(() => {
  // Unmount while the stubs are still in place: the component revokes its URL on the way out.
  cleanup()
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
})

function stubObjectUrls() {
  const create = vi.fn(() => 'blob:receipt-preview')
  const revoke = vi.fn()
  URL.createObjectURL = create
  URL.revokeObjectURL = revoke
  return { create, revoke }
}

const photo = new File(['x'], 'ticket.jpg', { type: 'image/jpeg' })

describe('ReceiptScanPreview', () => {
  it('shows the chosen photo with a sweeping scan bar and the "Analizando…" label', () => {
    stubObjectUrls()
    render(<ReceiptScanPreview file={photo} />)
    expect(screen.getByRole('img', { name: 'Foto de tu factura' })).toHaveAttribute(
      'src',
      'blob:receipt-preview',
    )
    expect(screen.getByTestId('receipt-scan-sweep')).toBeInTheDocument()
    expect(screen.getByText('Analizando…')).toBeInTheDocument()
  })

  it('releases the preview URL when it goes away', () => {
    const { revoke } = stubObjectUrls()
    const { unmount } = render(<ReceiptScanPreview file={photo} />)
    expect(revoke).not.toHaveBeenCalled()
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:receipt-preview')
  })

  it('falls back to Moni with the label, and no sweep, when there is no photo to show', () => {
    stubObjectUrls()
    render(<ReceiptScanPreview file={null} />)
    expect(screen.queryByRole('img', { name: 'Foto de tu factura' })).toBeNull()
    expect(screen.queryByTestId('receipt-scan-sweep')).toBeNull()
    expect(screen.getByText('Analizando…')).toBeInTheDocument()
  })

  it('falls back the same way when the browser cannot make a preview URL', () => {
    URL.createObjectURL = undefined as unknown as typeof URL.createObjectURL
    render(<ReceiptScanPreview file={photo} />)
    expect(screen.queryByRole('img', { name: 'Foto de tu factura' })).toBeNull()
    expect(screen.queryByTestId('receipt-scan-sweep')).toBeNull()
    expect(screen.getByText('Analizando…')).toBeInTheDocument()
  })
})
