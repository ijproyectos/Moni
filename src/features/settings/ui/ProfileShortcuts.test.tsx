import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ProfileAccessGrid, ProfileMoreTools } from './ProfileShortcuts'

const href = (name: RegExp | string) => screen.getByRole('link', { name }).getAttribute('href')

describe('ProfileShortcuts', () => {
  it('the grid links Presupuesto, Gastos fijos, Metas de ahorro and Grupos', () => {
    render(
      <MemoryRouter>
        <ProfileAccessGrid subtitles={{ Grupos: 'te deben $1.000' }} />
      </MemoryRouter>,
    )
    expect(href(/^Presupuesto/)).toBe('/metas')
    expect(href(/^Gastos fijos/)).toBe('/recurrentes?tab=gastos-fijos')
    expect(href(/^Metas de ahorro/)).toBe('/metas')
    expect(href(/^Grupos/)).toBe('/grupos')
    expect(screen.getByRole('link', { name: /^Grupos/ })).toHaveTextContent('te deben $1.000')
  })

  it('"Más herramientas" keeps every route that has no place in the design', () => {
    render(
      <MemoryRouter>
        <ProfileMoreTools />
      </MemoryRouter>,
    )
    expect(href(/^Tarjetas y cuotas/)).toBe('/cuentas?tab=tarjetas')
    expect(href(/^Viajes/)).toBe('/viajes')
    expect(href(/^Gastos hormiga/)).toBe('/hormigas')
    expect(href(/^Informes/)).toBe('/este-mes')
    expect(href(/^Categorías/)).toBe('/categorias')
    expect(screen.getByText('Más herramientas')).toBeInTheDocument()
  })
})
