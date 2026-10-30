import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { OfflineBanner } from './OfflineBanner'

function renderBanner(client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <OfflineBanner />
    </QueryClientProvider>,
  )
  return client
}

describe('OfflineBanner', () => {
  afterEach(() => act(() => onlineManager.setOnline(true)))

  it('renders nothing while online', () => {
    renderBanner()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an accessible notice offline, with the last update when known', () => {
    const client = new QueryClient()
    client.setQueryData(['accounts'], [], { updatedAt: new Date(2026, 0, 5, 14, 32).getTime() })
    renderBanner(client)
    act(() => onlineManager.setOnline(false))
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Sin conexión · Estás viendo datos guardados')
    expect(banner).toHaveTextContent('14:32')
  })

  it('refetches active queries and disappears when the connection returns', async () => {
    const client = renderBanner()
    act(() => onlineManager.setOnline(false))
    expect(screen.getByRole('status')).toBeInTheDocument()
    const spy = vi.spyOn(client, 'refetchQueries')
    act(() => onlineManager.setOnline(true))
    expect(spy).toHaveBeenCalledWith({ type: 'active' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
