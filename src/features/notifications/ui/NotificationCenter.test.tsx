import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { todayIso } from '@/shared/lib/month'
import type { CenterItem } from '../domain/centerItems'
import { PlusBell } from './NotificationCenter'

const hook = vi.hoisted(() => ({ items: [] as unknown[], remove: vi.fn() }))
vi.mock('./useNotificationCenter', () => ({
  useNotificationCenter: () => ({
    items: hook.items,
    unread: 0,
    isUnread: () => false,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    remove: hook.remove,
    isRemoving: false,
    isLoading: false,
  }),
}))

const at = (daysAgo: number, h = 10, m = 30) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const item = (over: Partial<CenterItem>): CenterItem => ({
  key: 'k', kind: 'group', text: 'texto', to: '/x', at: at(0), source: 'notice', hasTime: true, ...over,
})

async function open() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <ToastProvider>
        <PlusBell />
      </ToastProvider>
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: /Notificaciones/ }))
  return user
}

describe('Centro de notificaciones', () => {
  beforeEach(() => {
    hook.remove.mockReset()
    hook.remove.mockResolvedValue({ kept: 0 })
    hook.items = [
      item({ key: 'notice:a', text: 'Ana te incluyó en «Pizza»', at: at(0, 14, 5) }),
      item({ key: 'notice:b', text: 'Beto confirmó tu pago', at: at(1, 9, 10) }),
      item({ key: 'due:c', kind: 'payment_due', text: 'Netflix se cobra', source: 'derived', hasTime: false, at: `${todayIso()}T00:00:00Z` }),
    ]
  })

  it('groups by day (Hoy, Ayer) and shows the hour only when it is known', async () => {
    await open()
    expect(screen.getByRole('region', { name: 'Hoy' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ayer' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Hoy' })).getByText('Hoy · 14:05')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Ayer' })).getByText('Ayer · 09:10')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Hoy' })).getByText('Hoy', { selector: 'span' })).toBeInTheDocument()
  })

  it('deletes one notification', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Eliminar notificación: Beto confirmó tu pago' }))
    expect(hook.remove).toHaveBeenCalledWith([expect.objectContaining({ key: 'notice:b' })])
  })

  it('"Eliminar todas" asks first and then deletes everything', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Eliminar todas' }))
    expect(hook.remove).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog', { name: '¿Eliminar todas las notificaciones?' })).getByRole('button', { name: 'Eliminar todas' }))
    expect(hook.remove).toHaveBeenCalledWith(hook.items)
  })

  it('says when something stays because it still needs an answer', async () => {
    hook.remove.mockResolvedValue({ kept: 1 })
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Eliminar notificación: Ana te incluyó en «Pizza»' }))
    expect(await screen.findByText('Queda 1 aviso que todavía necesita tu respuesta')).toBeInTheDocument()
  })
})
