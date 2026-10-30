import '@fontsource/nunito/400.css'
import '@fontsource/nunito/500.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import './styles/index.css'
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { themeStore } from './features/settings/api/themeStore'
import { envResult } from './shared/lib/env'
import { ConfigErrorScreen } from './shared/ui/ConfigErrorScreen'
import { FullScreenLoader } from './shared/ui/FullScreenLoader'

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
