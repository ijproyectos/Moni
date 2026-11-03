import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  suspend: vi.fn(),
  unsuspend: vi.fn(),
  plusVencen: vi.fn(),
  notifyPlus: vi.fn(),
  avisos: vi.fn(),
  setSetting: vi.fn(),
  soporteTicket: vi.fn(),
  replyTicket: vi.fn(),
  setTicketStatus: vi.fn(),
}))
vi.mock('../api/adminRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/adminRepository')>()),
  adminApi: api,
}))

import { AdminApiError } from '../api/adminRepository'
import type { AvisosState, PlusExpiring as PlusExpiringData, UserDetail } from '../domain/types'
import { AutomaticNotices } from './AutomaticNotices'
import { PlusExpiring } from './PlusExpiring'
import { SoporteTicketPage } from './SoporteTicketPage'
import { SuspensionCard } from './SuspensionCard'

function wrap(node: ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/soporte/:id" element={node} />
          <Route path="*" element={node} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const ID = '11111111-1111-4111-8111-111111111111'
const detail = (over: Partial<UserDetail['estado']> = {}) =>
  ({
    user_id: ID,
    email: 'persona@example.com',
    estado: {
      suspended: false,
      suspension: null,
      tickets_total: 0,
      tickets_open: 0,
      ...over,
    },
  }) as UserDetail

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
})

describe('SuspensionCard', () => {
  it('needs a reason and the typed email before it can suspend', async () => {
    const user = userEvent.setup()
    wrap(<SuspensionCard user={detail()} />)
    const button = screen.getByRole('button', { name: 'Suspender cuenta' })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('Motivo de la suspensión'), 'Uso abusivo')
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('Email para confirmar'), 'otra@example.com')
    expect(button).toBeDisabled()
    await user.clear(screen.getByLabelText('Email para confirmar'))
    await user.type(screen.getByLabelText('Email para confirmar'), ' Persona@Example.com ')
    expect(button).toBeEnabled()
  })

  it('suspends after the confirmation and sends the reason and the typed email', async () => {
    api.suspend.mockResolvedValue({ suspended: true })
    const user = userEvent.setup()
    wrap(<SuspensionCard user={detail()} />)
    await user.type(screen.getByLabelText('Motivo de la suspensión'), 'Uso abusivo')
    await user.type(screen.getByLabelText('Email para confirmar'), 'persona@example.com')
    await user.click(screen.getByRole('button', { name: 'Suspender cuenta' }))
    expect(api.suspend).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Suspender' }))
    await waitFor(() =>
      expect(api.suspend).toHaveBeenCalledWith({
        userId: ID,
        reason: 'Uso abusivo',
        confirmEmail: 'persona@example.com',
      }),
    )
  })

  it('explains that an admin cannot be suspended', async () => {
    api.suspend.mockRejectedValue(new AdminApiError(400, 'cannot_suspend_admin'))
    const user = userEvent.setup()
    wrap(<SuspensionCard user={detail()} />)
    await user.type(screen.getByLabelText('Motivo de la suspensión'), 'Prueba')
    await user.type(screen.getByLabelText('Email para confirmar'), 'persona@example.com')
    await user.click(screen.getByRole('button', { name: 'Suspender cuenta' }))
    await user.click(screen.getByRole('button', { name: 'Suspender' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede suspender a otro administrador.',
    )
  })

  it('shows the reason of a suspended account and reactivates it after the confirmation', async () => {
    api.unsuspend.mockResolvedValue({ suspended: false })
    const user = userEvent.setup()
    wrap(
      <SuspensionCard
        user={detail({
          suspended: true,
          suspension: {
            reason: 'Uso abusivo',
            suspended_by: 'admin@example.com',
            suspended_at: '2026-11-02T15:00:00Z',
          },
        })}
      />,
    )
    expect(screen.getByText('Uso abusivo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email para confirmar')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reactivar cuenta' }))
    await user.click(screen.getByRole('button', { name: 'Reactivar' }))
    await waitFor(() => expect(api.unsuspend).toHaveBeenCalledWith(ID))
  })
})

const expiring = (): PlusExpiringData => ({
  days: 7,
  auto_renewing_excluded: 2,
  rows: [
    {
      user_id: ID,
      email: 'vence@example.com',
      source: 'promo',
      expires_at: '2026-11-05T15:00:00Z',
      days_left: 3,
      subscription_status: null,
      push_devices: 1,
      notified_levels: [],
    },
    {
      user_id: '22222222-2222-4222-8222-222222222222',
      email: 'sin-push@example.com',
      source: 'mercadopago',
      expires_at: '2026-11-04T15:00:00Z',
      days_left: 2,
      subscription_status: 'paused',
      push_devices: 0,
      notified_levels: [3],
    },
  ],
})

describe('PlusExpiring', () => {
  it('lists who really loses Plus and says how many renew by themselves', async () => {
    api.plusVencen.mockResolvedValue(expiring())
    wrap(<PlusExpiring />)
    expect(await screen.findByText('vence@example.com')).toBeInTheDocument()
    expect(screen.getByText('sin-push@example.com')).toBeInTheDocument()
    expect(screen.getByText(/2 más vencen pronto pero se renuevan solos/)).toBeInTheDocument()
  })

  it('notifies one person now, and disables the button when they have no device', async () => {
    api.plusVencen.mockResolvedValue(expiring())
    api.notifyPlus.mockResolvedValue({ recipients: 1, sent: 1, failed: 0, removed: 0 })
    const user = userEvent.setup()
    wrap(<PlusExpiring />)
    await screen.findByText('vence@example.com')
    const buttons = screen.getAllByRole('button', { name: 'Avisar ahora' })
    expect(buttons[1]).toBeDisabled()
    expect(screen.getByText('Sin dispositivos con avisos')).toBeInTheDocument()
    await user.click(buttons[0] as HTMLElement)
    await waitFor(() => expect(api.notifyPlus).toHaveBeenCalledWith(ID))
    expect(await screen.findByRole('status')).toHaveTextContent('Enviado: 1 de 1')
  })

  it('says when they were already told', async () => {
    api.plusVencen.mockResolvedValue(expiring())
    api.notifyPlus.mockRejectedValue(new AdminApiError(409, 'already_notified'))
    const user = userEvent.setup()
    wrap(<PlusExpiring />)
    await screen.findByText('vence@example.com')
    await user.click(screen.getAllByRole('button', { name: 'Avisar ahora' })[0] as HTMLElement)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya se le avisó por este vencimiento.',
    )
  })

  it('says so when nobody is about to lose Plus', async () => {
    api.plusVencen.mockResolvedValue({ days: 7, auto_renewing_excluded: 0, rows: [] })
    wrap(<PlusExpiring />)
    expect(await screen.findByText(/Nadie pierde Plus/)).toBeInTheDocument()
  })
})

const avisos = (over: Partial<AvisosState> = {}): AvisosState => ({
  nightly_push_enabled: true,
  plus_expiry_push_enabled: true,
  cron_configured: true,
  nightly_last_sent_at: null,
  nightly_last_sent_count: null,
  plus_notices_30d: 4,
  ...over,
})

describe('AutomaticNotices', () => {
  it('warns when the cron secret is not stored yet', async () => {
    api.avisos.mockResolvedValue(avisos({ cron_configured: false }))
    wrap(<AutomaticNotices />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta cargar el secreto del cron')
  })

  it('pauses the nightly reminder from its switch', async () => {
    api.avisos.mockResolvedValue(avisos())
    api.setSetting.mockResolvedValue({ key: 'nightly_push_enabled', enabled: false })
    const user = userEvent.setup()
    wrap(<AutomaticNotices />)
    const nightly = await screen.findByRole('switch', { name: 'Recordatorio nocturno' })
    expect(nightly).toHaveAttribute('aria-checked', 'true')
    await user.click(nightly)
    await waitFor(() =>
      expect(api.setSetting).toHaveBeenCalledWith({ key: 'nightly_push_enabled', enabled: false }),
    )
  })

  it('controls the Plus expiry notice with its own switch', async () => {
    api.avisos.mockResolvedValue(avisos({ plus_expiry_push_enabled: false }))
    api.setSetting.mockResolvedValue({ key: 'plus_expiry_push_enabled', enabled: true })
    const user = userEvent.setup()
    wrap(<AutomaticNotices />)
    await user.click(await screen.findByRole('switch', { name: 'Aviso de vencimiento de Plus' }))
    await waitFor(() =>
      expect(api.setSetting).toHaveBeenCalledWith({
        key: 'plus_expiry_push_enabled',
        enabled: true,
      }),
    )
  })
})

const ticket = (over: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: '22222222-2222-4222-8222-222222222222',
  email: 'persona@example.com',
  name: 'Persona',
  subject: 'No me carga un gasto',
  message: 'Pasa en Actividad.',
  status: 'open',
  reply: null,
  replied_at: null,
  replied_by: null,
  resolved_at: null,
  created_at: '2026-11-02T15:00:00Z',
  user_tickets_total: 1,
  ...over,
})

describe('SoporteTicketPage', () => {
  it('shows the message and a mail link to the person', async () => {
    api.soporteTicket.mockResolvedValue(ticket())
    wrap(<SoporteTicketPage />, `/soporte/${ID}`)
    expect(await screen.findByText('Pasa en Actividad.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Escribirle por mail' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:persona@example.com'),
    )
  })

  it('replies and resolves, and tells the admin when the person has no device', async () => {
    api.soporteTicket.mockResolvedValue(ticket())
    api.replyTicket.mockResolvedValue({
      replied: true,
      push: { recipients: 0, sent: 0, failed: 0, removed: 0 },
    })
    const user = userEvent.setup()
    wrap(<SoporteTicketPage />, `/soporte/${ID}`)
    const send = await screen.findByRole('button', { name: 'Enviar respuesta' })
    expect(send).toBeDisabled()
    await user.type(screen.getByLabelText('Respuesta'), 'Ya lo arreglamos.')
    await user.click(send)
    await waitFor(() =>
      expect(api.replyTicket).toHaveBeenCalledWith({
        ticketId: ID,
        reply: 'Ya lo arreglamos.',
        resolve: true,
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'La persona no tiene avisos activados',
    )
  })

  it('can reply without resolving, and can reopen a resolved ticket', async () => {
    api.soporteTicket.mockResolvedValue(
      ticket({ status: 'resolved', reply: 'Hecho', replied_at: '2026-11-02T16:00:00Z' }),
    )
    api.setTicketStatus.mockResolvedValue({ status: 'open' })
    const user = userEvent.setup()
    wrap(<SoporteTicketPage />, `/soporte/${ID}`)
    expect(await screen.findByText('Hecho')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reabrir' }))
    await waitFor(() =>
      expect(api.setTicketStatus).toHaveBeenCalledWith({ ticketId: ID, status: 'open' }),
    )
  })

  it('says when the ticket does not exist', async () => {
    api.soporteTicket.mockRejectedValue(new AdminApiError(404, 'not_found'))
    wrap(<SoporteTicketPage />, `/soporte/${ID}`)
    expect(await screen.findByText('No encontramos esa consulta.')).toBeInTheDocument()
  })
})
