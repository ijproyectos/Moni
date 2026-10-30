import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { makeAccount } from '@/features/accounts/domain/testing'
import { ToastProvider } from '@/shared/ui/Toast'
import { patchOverlay } from '../mock/overlayStore'
import { ShareSummaryPage } from './GroupSummaryPages'

const GROUP = 'g1'
const copied = vi.hoisted(() => ({ texts: [] as string[] }))

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
        expenses: [],
      },
    }),
  }
})
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
