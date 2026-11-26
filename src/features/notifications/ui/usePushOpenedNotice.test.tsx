import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { usePushOpenedNotice } from './usePushOpenedNotice'

const ID = '11111111-1111-4111-8111-111111111111'
const open = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../api/centerRepository', () => ({ openNoticeFromPush: open }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function Probe() {
  usePushOpenedNotice()
  const l = useLocation()
  return <p data-testid="loc">{l.pathname + l.search}</p>
}

function setup(url: string) {
  const client = new QueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return spy
}

describe('usePushOpenedNotice', () => {
  beforeEach(() => open.mockClear())

  it('a notice opened from a push is opened once, the counters refresh and the marker leaves the address', async () => {
    const spy = setup(`/grupos/avisos?aviso=${ID}&push=1`)
    await waitFor(() => expect(open).toHaveBeenCalledWith(ID))
    expect(open).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent(`/grupos/avisos?aviso=${ID}`))
    expect(screen.getByTestId('loc')).not.toHaveTextContent('push=1')
    await waitFor(() => expect(spy).toHaveBeenCalled())
  })

  it('an in-app tap on a notice (no push marker) does not remove it', () => {
    setup(`/grupos/avisos?aviso=${ID}`)
    expect(open).not.toHaveBeenCalled()
  })

  it('ignores an id that is not a uuid', () => {
    setup('/grupos/avisos?aviso=../../x&push=1')
    expect(open).not.toHaveBeenCalled()
  })
})
