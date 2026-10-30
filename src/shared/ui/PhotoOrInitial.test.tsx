import { fireEvent, render, screen } from '@testing-library/react'
import { PhotoOrInitial } from './PhotoOrInitial'

describe('PhotoOrInitial', () => {
  it('renders a lazy no-referrer photo', () => {
    render(<PhotoOrInitial url="https://lh3.googleusercontent.com/a" initial="A" alt="Tu foto" />)
    const img = screen.getByRole('img', { name: 'Tu foto' })
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveClass('object-cover', 'rounded-full')
  })

  it('shows the initial without a URL', () => {
    render(<PhotoOrInitial url={null} initial="A" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('falls back to the initial when the image fails', () => {
    render(<PhotoOrInitial url="https://broken" initial="A" alt="Tu foto" />)
    fireEvent.error(screen.getByRole('img', { name: 'Tu foto' }))
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
