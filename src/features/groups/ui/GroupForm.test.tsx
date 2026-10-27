import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupForm } from './GroupForm'
import { JoinCodeForm } from './JoinCodeForm'

describe('GroupForm', () => {
  it('requires a name', async () => {
    const onSubmit = vi.fn()
    render(<GroupForm isSubmitting={false} submitError={null} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear grupo' }))
    expect(await screen.findByText('Ponele un nombre al grupo.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the trimmed name and the chosen kind (Casa by default)', async () => {
    const onSubmit = vi.fn()
    render(<GroupForm isSubmitting={false} submitError={null} onSubmit={onSubmit} />)
    expect(screen.getByRole('button', { name: 'Casa' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.type(screen.getByLabelText('Nombre del grupo'), '  Viaje a Bariloche ')
    await userEvent.click(screen.getByRole('button', { name: 'Viaje' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear grupo' }))
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: 'Viaje a Bariloche', kind: 'viaje' }),
    )
  })
})

describe('JoinCodeForm', () => {
  it('normalizes the typed code and submits it', async () => {
    const onSubmit = vi.fn()
    render(<JoinCodeForm isSubmitting={false} submitError={null} onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Código del grupo')
    await userEvent.type(input, 'abcd-23 45wxyz')
    expect(input).toHaveValue('ABCD2345WXYZ')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al grupo' }))
    expect(onSubmit).toHaveBeenCalledWith('ABCD2345WXYZ')
  })

  it('rejects short or ambiguous codes without calling the server', async () => {
    const onSubmit = vi.fn()
    render(<JoinCodeForm isSubmitting={false} submitError={null} onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('Código del grupo'), 'AB10')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar al grupo' }))
    expect(await screen.findByText('El código tiene 12 letras o números.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
