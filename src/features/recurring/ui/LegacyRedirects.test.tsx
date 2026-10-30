import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { LegacyFijosRedirect, LegacyTarjetasRedirect } from './LegacyRedirects'

function Where() {
  const loc = useLocation()
  return <p data-testid="where">{loc.pathname + loc.search}</p>
}

function go(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Where />
      <Routes>
        <Route path="/fijos" element={<LegacyFijosRedirect />} />
        <Route path="/recurrentes" element={<p>recurrentes</p>} />
        <Route path="/tarjetas" element={<LegacyTarjetasRedirect />} />
        <Route path="/cuentas" element={<p>cuentas</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByTestId('where').textContent
}

describe('old /fijos links keep working', () => {
  it('/fijos → /recurrentes', () => {
    expect(go('/fijos')).toBe('/recurrentes')
  })
  it('/fijos?tab=cuotas → Medios de pago › Cuotas', () => {
    expect(go('/fijos?tab=cuotas')).toBe('/cuentas?tab=cuotas')
  })
  it('/fijos?tab=gastos-fijos → Gastos fijos', () => {
    expect(go('/fijos?tab=gastos-fijos')).toBe('/recurrentes?tab=gastos-fijos')
  })
})

describe('old /tarjetas links keep working', () => {
  it('/tarjetas → Medios de pago › Tarjetas', () => {
    expect(go('/tarjetas')).toBe('/cuentas?tab=tarjetas')
  })
  it('/tarjetas?tab=cuotas → Medios de pago › Cuotas', () => {
    expect(go('/tarjetas?tab=cuotas')).toBe('/cuentas?tab=cuotas')
  })
})
