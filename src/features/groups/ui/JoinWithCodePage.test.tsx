import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { JoinWithCodePage } from './JoinGroupPage'

vi.mock('../api/useGroups', () => ({ useJoinGroup: () => ({}) }))
vi.mock('@/features/auth/api/useProfile', () => ({ useProfile: () => ({ data: null }) }))

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <JoinWithCodePage />
    </MemoryRouter>,
  )
}

describe('JoinWithCodePage ?codigo=', () => {
  it('prefills the code from the query string', () => {
    renderAt('/grupos/unirse?codigo=abcd-2345-efgh')
    expect(screen.getByLabelText('Código del grupo')).toHaveValue('ABCD-2345-EFGH')
    expect(screen.getByRole('button', { name: /Buscar grupo/ })).toBeEnabled()
  })

  it('starts empty without the param', () => {
    renderAt('/grupos/unirse')
    expect(screen.getByLabelText('Código del grupo')).toHaveValue('')
    expect(screen.getByRole('button', { name: /Buscar grupo/ })).toBeDisabled()
  })
})

describe('JoinWithCodePage code formats', () => {
  it('accepts a new 8-char code and shows it in two blocks', () => {
    renderAt('/grupos/unirse?codigo=wxyz2345')
    expect(screen.getByLabelText('Código del grupo')).toHaveValue('WXYZ-2345')
    expect(screen.getByRole('button', { name: /Buscar grupo/ })).toBeEnabled()
  })

  it('does not enable the search for an incomplete code', () => {
    renderAt('/grupos/unirse?codigo=wxyz-234')
    expect(screen.getByRole('button', { name: /Buscar grupo/ })).toBeDisabled()
  })

  it('finds the code inside a pasted link', async () => {
    const user = userEvent.setup()
    renderAt('/grupos/unirse')
    const input = screen.getByLabelText('Código del grupo')
    await user.click(input)
    await user.paste('https://moni.app/unirse/WXYZ-2345')
    expect(input).toHaveValue('WXYZ-2345')
  })
})
