import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ProfileShortcuts } from './ProfileShortcuts'

describe('ProfileShortcuts', () => {
  it('links the sections that left the bottom bar', () => {
    render(
      <MemoryRouter>
        <ProfileShortcuts />
      </MemoryRouter>,
    )
    const href = (name: RegExp | string) => screen.getByRole('link', { name }).getAttribute('href')
    expect(href(/^Presupuesto/)).toBe('/metas')
    expect(href(/^Gastos fijos/)).toBe('/recurrentes?tab=gastos-fijos')
    expect(href(/^Metas/)).toBe('/metas')
    expect(href(/^Grupos/)).toBe('/grupos')
    expect(href(/^Medios de pago/)).toBe('/cuentas')
    expect(href(/^Tarjetas y cuotas/)).toBe('/cuentas?tab=tarjetas')
    expect(href(/^Viajes/)).toBe('/viajes')
    expect(href(/^Gastos hormiga/)).toBe('/hormigas')
    expect(href(/^Informes/)).toBe('/este-mes')
    expect(href(/^Categorías/)).toBe('/categorias')
    expect(screen.getByText('Más herramientas')).toBeInTheDocument()
  })
})
