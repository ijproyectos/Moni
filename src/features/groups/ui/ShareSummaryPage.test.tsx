import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { makeAccount } from '@/features/accounts/domain/testing'
import { ToastProvider } from '@/shared/ui/Toast'
import { patchOverlay } from '../mock/overlayStore'
import { ShareSummaryPage } from './GroupSummaryPages'

const GROUP = 'g1'
const copied = vi.hoisted(() => ({ texts: [] as string[] }))
const image = vi.hoisted(() => ({ render: vi.fn() }))
vi.mock('../lib/summaryImage', () => ({ renderSummaryImage: image.render }))

vi.mock('@/shared/lib/share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/share')>()),
  copyText: (text: string) => {
    copied.texts.push(text)
    return Promise.resolve()
  },
}))
vi.mock('../api/useGroupLedger', async () => {
  const { useOverlay } = await import('../mock/overlayStore')
  return {
    useGroupLedger: (id: string) => ({
      meId: 'me',
      name: 'Viaje a Brasil',
      overlay: useOverlay(id),
      ledger: {
        people: [
          { id: 'me', name: 'Vos', hasMoni: true, isMe: true },
          { id: 'ana', name: 'Ana', hasMoni: true, isMe: false },
        ],
        transfers: [{ fromUserId: 'ana', toUserId: 'me', amountCents: 25_000_00 }],
        expenses: [
          {
            id: 'e1',
            description: 'Cena en Ipanema',
            amountCents: 60_000_00,
            payers: [{ personId: 'me', cents: 60_000_00 }],
          },
          {
            id: 'e2',
            description: 'Taxi al aeropuerto',
            amountCents: 40_000_00,
            payers: [
              { personId: 'me', cents: 15_000_00 },
              { personId: 'ana', cents: 25_000_00 },
            ],
          },
        ],
        totalCents: 100_000_00,
        paid: { me: 75_000_00, ana: 25_000_00 },
        owed: { me: 50_000_00, ana: 50_000_00 },
        nets: { me: 25_000_00, ana: -25_000_00 },
      },
    }),
  }
})
vi.mock('@/features/auth/api/useProfile', () => ({
  useProfile: () => ({ data: { display_name: 'Iara Rodríguez' } }),
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash' }),
      makeAccount({
        id: 'galicia',
        name: 'Galicia',
        kind: 'bank',
        transferAlias: 'galicia.sueldo',
        transferCbu: '0070000030000012345678',
      }),
      makeAccount({ id: 'mp', name: 'Mercado Pago', kind: 'wallet', transferAlias: 'mi.alias.mp' }),
      makeAccount({ id: 'brubank', name: 'Brubank', kind: 'bank' }),
    ],
  }),
}))

function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/grupos/${GROUP}/compartir`]}>
      <ToastProvider>
        <Routes>
          <Route path="/grupos/:id/compartir" element={<ShareSummaryPage />} />
          <Route path="/cuentas" element={<p>medios de pago</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  copied.texts.length = 0
  patchOverlay(GROUP, { collectAccountId: undefined })
})

async function openText(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Copiar texto' }))
}

describe('Compartir resumen: datos para transferencias', () => {
  it('shares nothing by default, even when accounts have an alias and a CBU', async () => {
    const user = renderPage()
    await openText(user)
    expect(screen.getByText('No incluir mis datos')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Copiar texto del grupo' }))
    expect(copied.texts).toHaveLength(1)
    expect(copied.texts[0]).toContain('Ana me pasa $25.000')
    expect(copied.texts[0]).not.toMatch(
      /galicia\.sueldo|0070000030000012345678|mi\.alias\.mp|Alias|CBU/,
    )
  })

  it('only offers banks and wallets that have data (not cash, not an account without data)', async () => {
    const user = renderPage()
    await openText(user)
    await user.click(screen.getByRole('button', { name: /Elegir/ }))
    const sheet = screen.getByRole('dialog', { name: '¿A dónde te transfieren?' })
    expect(within(sheet).getByRole('button', { name: /Galicia/ })).toBeVisible()
    expect(within(sheet).getByRole('button', { name: /Mercado Pago/ })).toBeVisible()
    expect(within(sheet).queryByRole('button', { name: /Efectivo/ })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: /Brubank/ })).toBeNull()
  })

  it('choosing an account does nothing until it is confirmed', async () => {
    const user = renderPage()
    await openText(user)
    await user.click(screen.getByRole('button', { name: /Elegir/ }))
    const sheet = screen.getByRole('dialog', { name: '¿A dónde te transfieren?' })
    await user.click(within(sheet).getByRole('button', { name: /Galicia/ }))
    // Closing without confirming leaves everything as it was.
    await user.click(within(sheet).getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByText('No incluir mis datos')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Copiar texto del grupo' }))
    expect(copied.texts[0]).not.toMatch(/galicia\.sueldo/)
  })

  it("once confirmed, the summary names that account's alias and CBU, and only that account's", async () => {
    const user = renderPage()
    await openText(user)
    await user.click(screen.getByRole('button', { name: /Elegir/ }))
    const sheet = screen.getByRole('dialog', { name: '¿A dónde te transfieren?' })
    await user.click(within(sheet).getByRole('button', { name: /Galicia/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Incluir en el resumen' }))
    expect(screen.getByText('Galicia')).toBeVisible()
    expect(screen.getByText('Alias: galicia.sueldo · CBU: 0070000030000012345678')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Copiar texto del grupo' }))
    expect(copied.texts[0]).toContain(
      'Ana me pasa $25.000 (Alias: galicia.sueldo · CBU: 0070000030000012345678)',
    )
    expect(copied.texts[0]).not.toMatch(/mi\.alias\.mp/)
  })

  it('a wallet is shared with its alias (and CVU if it has one)', async () => {
    const user = renderPage()
    await openText(user)
    await user.click(screen.getByRole('button', { name: /Elegir/ }))
    const sheet = screen.getByRole('dialog', { name: '¿A dónde te transfieren?' })
    await user.click(within(sheet).getByRole('button', { name: /Mercado Pago/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Incluir en el resumen' }))
    await user.click(screen.getByRole('button', { name: 'Copiar texto del grupo' }))
    expect(copied.texts[0]).toContain('Ana me pasa $25.000 (Alias: mi.alias.mp)')
  })

  it('the person can take them out again with "No incluir mis datos"', async () => {
    patchOverlay(GROUP, { collectAccountId: 'galicia' })
    const user = renderPage()
    await openText(user)
    await user.click(screen.getByRole('button', { name: /Cambiar/ }))
    const sheet = screen.getByRole('dialog', { name: '¿A dónde te transfieren?' })
    await user.click(within(sheet).getByRole('button', { name: 'No incluir mis datos' }))
    await user.click(within(sheet).getByRole('button', { name: 'Listo' }))
    await user.click(screen.getByRole('button', { name: 'Copiar texto del grupo' }))
    expect(copied.texts[0]).not.toMatch(/galicia\.sueldo/)
  })

  it('an account that lost its data (or does not exist any more) is not used', async () => {
    patchOverlay(GROUP, { collectAccountId: 'brubank' })
    const user = renderPage()
    await openText(user)
    expect(screen.getByText('No incluir mis datos')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Copiar texto del grupo' }))
    expect(copied.texts[0]).not.toMatch(/Alias|CBU/)
  })
})

describe('Compartir resumen: el resumen completo', () => {
  const share = vi.fn()
  const open = vi.fn()
  const downloaded = { files: [] as string[] }

  beforeEach(() => {
    share.mockReset()
    open.mockReset()
    downloaded.files.length = 0
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    vi.spyOn(window, 'open').mockImplementation(open)
  })
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share')
    Reflect.deleteProperty(navigator, 'canShare')
    vi.restoreAllMocks()
  })

  it('opens on the full summary, with every detail of the screen and the same amounts', () => {
    renderPage()
    const text = screen.getByLabelText('Resumen completo').textContent ?? ''
    expect(text).toContain('*Resumen de Viaje a Brasil*')
    expect(text).toContain('2 personas')
    expect(text).toContain('• Cena en Ipanema: $60.000 (pagó Iara)')
    expect(text).toContain('• Taxi al aeropuerto: $40.000 (pagaron Iara $15.000 y Ana $25.000)')
    expect(text).toContain('*Total gastado: $100.000*')
    expect(text).toContain('• Iara: puso $75.000, le tocaba $50.000 → saldo +$25.000')
    expect(text).toContain('• Ana: puso $25.000, le tocaba $50.000 → saldo -$25.000')
    expect(text).toContain('• Ana → Iara: $25.000')
    expect(text).toContain('Hecho con Moni')
    // The person is named, not "Vos": whoever reads it is somebody else.
    expect(text).not.toContain('Vos')
  })

  it('"Copiar resumen" copies exactly the text shown', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Copiar resumen' }))
    expect(copied.texts).toEqual([screen.getByLabelText('Resumen completo').textContent])
  })

  it('"Compartir" opens the share menu with the whole text', async () => {
    share.mockResolvedValue(undefined)
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(share).toHaveBeenCalledTimes(1)
    expect(share.mock.calls[0]?.[0].text).toBe(
      screen.getByLabelText('Resumen completo').textContent,
    )
  })

  it('without a share menu (desktop), "Compartir" opens WhatsApp with the summary', async () => {
    Reflect.deleteProperty(navigator, 'share')
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Compartir' }))
    const url = String(open.mock.calls[0]?.[0])
    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/)
    expect(decodeURIComponent(url)).toContain('*Total gastado: $100.000*')
  })

  it('includes the transfer data only when the person chose them', async () => {
    const user = renderPage()
    expect(screen.getByLabelText('Resumen completo').textContent).not.toContain('galicia.sueldo')
    await user.click(screen.getByRole('button', { name: /Datos para que te transfieran/ }))
    await user.click(screen.getByRole('button', { name: /Galicia/ }))
    await user.click(screen.getByRole('button', { name: 'Incluir en el resumen' }))
    expect(screen.getByLabelText('Resumen completo').textContent).toContain(
      '• Ana → Iara: $25.000 (Alias: galicia.sueldo · CBU: 0070000030000012345678)',
    )
  })

  it('"Descargar resumen" builds the image and saves it as a PNG', async () => {
    const png = new Blob(['x'], { type: 'image/png' })
    image.render.mockResolvedValue(png)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded.files.push(this.download)
    })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Descargar resumen' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(downloaded.files).toEqual(['resumen-viaje-a-brasil.png'])
    // The image is drawn from the same model as the text: same total and same transfer.
    const model = image.render.mock.calls[0]?.[0]
    expect(model.total).toBe('$100.000')
    expect(model.transfers).toEqual([{ from: 'Ana', to: 'Iara', amount: '$25.000', transfer: '' }])
  })

  it('offers "Compartir imagen" only where the device can share files', async () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Compartir imagen' })).toBeNull()
    cleanup()
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    renderPage()
    expect(screen.getByRole('button', { name: 'Compartir imagen' })).toBeInTheDocument()
  })
})
