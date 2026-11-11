import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeCapture } from './HomeCapture'

describe('HomeCapture', () => {
  it('the microphone opens voice and the keyboard opens the manual sheet', async () => {
    const onVoice = vi.fn()
    const onManual = vi.fn()
    render(<HomeCapture onVoice={onVoice} onManual={onManual} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Cargar con la voz' }))
    expect(onVoice).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Cargar a mano' }))
    expect(onManual).toHaveBeenCalledTimes(1)
  })

  it('offline the microphone is disabled and says why, but the keyboard still works', () => {
    render(<HomeCapture onVoice={vi.fn()} onManual={vi.fn()} offline />)
    expect(screen.getByRole('button', { name: 'Cargar con la voz' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Sin conexión')
    expect(screen.getByRole('button', { name: 'Cargar a mano' })).toBeEnabled()
  })

  it('on Free the microphone wears the Plus badge', () => {
    render(<HomeCapture onVoice={vi.fn()} onManual={vi.fn()} voicePlusBadge />)
    expect(screen.getByRole('button', { name: 'Cargar con la voz, Plus' })).toBeInTheDocument()
  })

  it('without voice only the manual button is offered', () => {
    render(<HomeCapture onManual={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /voz/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cargar a mano' })).toBeInTheDocument()
  })
})
