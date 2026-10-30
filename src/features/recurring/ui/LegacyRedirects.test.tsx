import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { LegacyFijosRedirect } from './LegacyRedirects'

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
        <Route path="/tarjetas" element={<p>tarjetas</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByTestId('where').textContent
}

describe('old /fijos links keep working', () => {
  it('/fijos → /recurrentes', () => {
    expect(go('/fijos')).toBe('/recurrentes')
  })
  it('/fijos?tab=cuotas → Tarjetas de crédito › Cuotas', () => {
    expect(go('/fijos?tab=cuotas')).toBe('/tarjetas?tab=cuotas')
  })
  it('/fijos?tab=gastos-fijos → Gastos fijos', () => {
    expect(go('/fijos?tab=gastos-fijos')).toBe('/recurrentes?tab=gastos-fijos')
  })
})
