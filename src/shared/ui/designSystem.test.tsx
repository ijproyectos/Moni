import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { MoniAddButton } from './MoniAddButton'
import { themedColor } from './categoryIcons'
import { KIND_ACTIVE } from './fieldStyles'
import { OptionRow, Page, SectionLabel } from './kit'
import { SegmentedControl } from './SegmentedControl'

describe('shared design system', () => {
  it('the primary button is Moni forest (lime only in the dark theme) and still clicks', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Guardar</Button>)
    const button = screen.getByRole('button', { name: 'Guardar' })
    expect(button).toHaveClass('bg-forest', 'text-cream', 'dark:bg-lime')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('a disabled button does not fire', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('sheets render at the native Figma scale and close with the X and Escape', async () => {
    const onClose = vi.fn()
    render(
      <BottomSheet title="Nuevo medio de pago" onClose={onClose}>
        <p>contenido</p>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Nuevo medio de pago' })
    expect(dialog.parentElement).toHaveClass('figma-scale')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('keeps the color the person chose and only nudges ones that would vanish on the theme', () => {
    expect(themedColor('#e5533d')).toBe('#e5533d')
    expect(themedColor('#111111')).toContain('var(--cat-lift)')
    expect(themedColor('#fafafa')).toContain('var(--cat-sink)')
  })

  it('the Gasto / Ingreso switch uses the semantic colors, not decorative ones', () => {
    expect(KIND_ACTIVE.expense).toContain('bg-expense')
    expect(KIND_ACTIVE.income).toContain('bg-income')
  })

  it('the cat button shows a plus when closed and a cross when its menu is open', () => {
    const { rerender } = render(<MoniAddButton aria-label="Nuevo movimiento" />)
    expect(document.querySelector('svg.lucide-plus')).not.toBeNull()
    rerender(<MoniAddButton aria-label="Cerrar" open />)
    expect(document.querySelector('svg.lucide-x')).not.toBeNull()
    expect(document.querySelector('svg.lucide-plus')).toBeNull()
  })

  it('Page keeps the density lever until a screen is adapted, then it is native with 20px margins', () => {
    const { container, rerender } = render(<Page>hola</Page>)
    expect(container.firstElementChild).toHaveClass('px-4')
    expect(container.firstElementChild).not.toHaveClass('figma-scale')
    rerender(<Page native>hola</Page>)
    expect(container.firstElementChild).toHaveClass('figma-scale', 'px-5')
  })

  it('the segmented control marks the active option with a light pill and still switches', async () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="Tipo"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Suscripciones' },
          { value: 'b', label: 'Gastos fijos' },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Suscripciones' })).toHaveClass('bg-card')
    expect(screen.getByRole('button', { name: 'Gastos fijos' })).not.toHaveClass('bg-card')
    await userEvent.click(screen.getByRole('button', { name: 'Gastos fijos' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('section titles of the list screens are plain text, the caps look stays for forms', () => {
    render(
      <>
        <SectionLabel plain>Mis datos</SectionLabel>
        <SectionLabel>Nombre</SectionLabel>
      </>,
    )
    expect(screen.getByText('Mis datos')).not.toHaveClass('uppercase')
    expect(screen.getByText('Nombre')).toHaveClass('uppercase')
  })

  it('an option row works without icon: title, detail and a press that fires', async () => {
    const onClick = vi.fn()
    render(<OptionRow title="Datos personales" subtitle="Nombre, mail y foto" onClick={onClick} />)
    expect(screen.getByText('Nombre, mail y foto')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Datos personales/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
