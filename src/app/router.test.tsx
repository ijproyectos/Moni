import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { FEATURES, type FeatureFlag } from '@/shared/config/features'
import { appRoutes as rawRoutes } from './router'

const appRoutes: { path?: string; element: ReactElement }[] = rawRoutes

const FLAGGED: [path: string, flag: FeatureFlag][] = [
  ['/avisos', 'notifications'],
  ['/pro', 'pro'],
  ['/recomendar', 'referral'],
  ['/deudas', 'debts'],
  ['/aguinaldo', 'aguinaldo'],
  ['/aguinaldo/reparto', 'aguinaldo'],
  ['/aguinaldo/listo', 'aguinaldo'],
  ['/viajes/abc', 'soloTrips'],
  ['/hormigas/aviso-semanal', 'weeklyDigest'],
]

/** Real flagged routes, with the home route replaced by a stub (the gate never renders the page). */
function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>home stub</p>} />
        {appRoutes
          .filter((r) => r.path !== undefined)
          .map((r) => (
            <Route key={r.path} path={`/${r.path}`} element={r.element} />
          ))}
      </Routes>
    </MemoryRouter>,
  )
}

describe('feature-flagged routes', () => {
  it.each(FLAGGED)('%s redirects home while its flag is off', async (path) => {
    renderAt(path)
    expect(await screen.findByText('home stub')).toBeInTheDocument()
  })

  it('declares a gate for every flagged path', () => {
    const paths = new Set(appRoutes.map((r) => (r.path ? `/${r.path}` : '/')))
    for (const [path] of FLAGGED) {
      const template = path.replace('/abc', '/:id')
      expect(paths.has(template)).toBe(true)
    }
    expect(FEATURES.pro).toBe(false)
  })
})
