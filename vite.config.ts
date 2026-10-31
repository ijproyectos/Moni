/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// package.json stays the single source of truth for the version; the short commit is optional.
function shortSha(): string {
  const fromEnv = process.env.COMMIT_REF?.slice(0, 7) // Netlify
  if (fromEnv) return fromEnv
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

const sha = shortSha()

// Supabase (REST, RPC, auth, edge functions, storage, realtime) must always hit the network: money and
// sessions are never served from a service-worker cache.
const isSupabaseRequest = ({ url }: { url: URL }) =>
  /(^|\.)supabase\.(co|in)$/.test(url.hostname) ||
  /^\/(rest|auth|functions|storage|realtime)\/v1\//.test(url.pathname)

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(sha ? `${pkg.version}+${sha}` : pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Prompt before swapping versions ("Hay una versión nueva · Actualizar"); registered by UpdatePrompt.
      registerType: 'prompt',
      injectRegister: false,
      // Production build only: no service worker in `vite dev` (devOptions stay disabled) or in tests.
      disable: Boolean(process.env.VITEST),
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Moni',
        short_name: 'Moni',
        description: 'Moni — tu plata, bajo control. Sin vueltas.',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Brand forest for the install UI and the splash (the manifest cannot vary by theme; the page itself
        // updates <meta name="theme-color"> at runtime, see src/features/settings/domain/theme.ts).
        theme_color: '#064735',
        background_color: '#064735',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell (HTML, JS, CSS, images, latin fonts) so it opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}', '**/*latin-*.woff2'],
        cleanupOutdatedCaches: true,
        // SPA fallback, mirroring the /* -> /index.html rewrite in netlify.toml.
        navigateFallback: '/index.html',
        // Never answer these navigations from the cache: the OAuth callback must reach the network, and
        // API-like paths are not pages.
        navigateFallbackDenylist: [
          /^\/auth\/callback/,
          /^\/mp\/callback\.html/,
          /^\/(rest|auth|functions|storage|realtime)\/v1\//,
        ],
        runtimeCaching: [{ urlPattern: isSupabaseRequest, handler: 'NetworkOnly' }],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
