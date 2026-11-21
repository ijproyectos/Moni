import '@fontsource-variable/nunito'
import './styles/index.css'
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { themeStore } from './features/settings/api/themeStore'
import { envResult } from './shared/lib/env'
import { ConfigErrorScreen } from './shared/ui/ConfigErrorScreen'
import { FullScreenLoader } from './shared/ui/FullScreenLoader'

// crypto.randomUUID only exists in secure contexts (https or localhost). Opening the app over plain http on a local network (for
// example to try it on a phone) would break every form that creates an id, so a small fallback fills the gap.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  ;(crypto as { randomUUID: () => string }).randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = ((b[6] ?? 0) & 0x0f) | 0x40
    b[8] = ((b[8] ?? 0) & 0x3f) | 0x80
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
}

// The app module touches Supabase on import, so it only loads once configuration is valid.
const App = lazy(() => import('./app/App').then((module) => ({ default: module.App })))

// The inline script in index.html already painted the theme; this keeps it in sync with the OS afterwards.
themeStore.start()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    {envResult.ok ? (
      <Suspense fallback={<FullScreenLoader />}>
        <App />
      </Suspense>
    ) : (
      <ConfigErrorScreen missing={envResult.missing} />
    )}
  </StrictMode>,
)
