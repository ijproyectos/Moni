# Sprint 1 — Foundations

Status: implemented locally, not committed, not deployed. Database migrations written but **not executed**.

## What was built

| Area          | Result                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tooling       | Vite 6 + React 19 + TypeScript strict, Tailwind CSS v4, ESLint (flat, strict), Prettier, Vitest + Testing Library                                                 |
| Design tokens | `src/styles/index.css` `@theme`: full brand palette, category colors, radii, Fredoka/Outfit (self-hosted via Fontsource)                                          |
| Assets        | Mascot and logo SVGs copied unchanged to `src/assets/{mascot,brand}`; app icons in `public/`                                                                      |
| Shared UI     | `Button` (56 px pill: primary/dark/ghost), `BottomNav`, `Fab`, `Coin`, `FullScreenLoader`, `ConfigErrorScreen`, `ComingSoonPage`                                  |
| Shared lib    | `env.ts` (zod validation, config-error screen instead of crash), `supabase.ts` (publishable key, PKCE), `money.ts` (integer cents, es-AR formatting, equal split) |
| Auth          | `AuthProvider`, `RequireAuth`, `RedirectIfAuthenticated`, `/auth/callback`, Google sign-in, sign-out                                                              |
| Screens       | 01 Bienvenida (faithful to the design export); private shell with Inicio, Actividad, Grupos, Más                                                                  |
| Database      | `profiles` table, signup trigger, `updated_at` trigger, protected columns, RLS (own row only), column-level grants                                                |
| Delivery      | `netlify.toml`, `.nvmrc`, GitHub Actions CI (lint, typecheck, test, build)                                                                                        |

Tab pages intentionally show only their title and a "next sprint" note: no mock data. The FAB is visible but disabled until the new-movement flow lands in Sprint 2. Más shows the real profile (name/avatar from Google) and sign-out.

## Routes

| Path                                 | Access         | Screen                                                 |
| ------------------------------------ | -------------- | ------------------------------------------------------ |
| `/bienvenida`                        | anonymous only | 01 Bienvenida                                          |
| `/auth/callback`                     | public         | OAuth return; redirects to `/` once the session exists |
| `/`, `/actividad`, `/grupos`, `/mas` | authenticated  | App shell tabs                                         |
| anything else                        | —              | redirects to `/`                                       |

## Run locally

```bash
nvm use            # Node 24 (CI/Netlify); local Node 26 also works
npm ci
cp .env.example .env.local   # fill in your own values; never commit it
npm run dev        # http://localhost:5173
```

Checks: `npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run build`.

## Setup checklist (owner: you — never paste secrets in chat)

### Supabase

1. Create a project (recommended: separate `moni-dev` and `moni-prod`).
2. Put the project URL and the **publishable** key in `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
3. Authentication → URL Configuration:
   - Site URL: production Netlify URL.
   - Redirect URLs: `http://localhost:5173/auth/callback`, `https://<site>.netlify.app/auth/callback`, `https://deploy-preview-*--<site>.netlify.app/auth/callback`.
4. Apply `supabase/migrations/20261025000000_create_profiles.sql` only after approval (CLI: `supabase link` then `supabase db push`).

### Google Cloud

1. OAuth consent screen (External; app name Moni; scopes `openid`, `email`, `profile`).
2. Credentials → OAuth client ID → Web application.
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Paste Client ID and Client Secret into Supabase → Authentication → Providers → Google (dashboard only, never the repo).

### Netlify

1. Import the GitHub repository `ijproyectos/Moni`.
2. Build settings come from `netlify.toml`.
3. Environment variables per context: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Local database (optional, recommended)

Install Docker and the Supabase CLI, then `supabase start` and `supabase test db` to run the pgTAP suite. `supabase/config.toml` is hand-written; regenerate it with `supabase init` if the CLI complains.

## Pending

- pgTAP suite `supabase/tests/profiles_rls.test.sql` **not executed** (no Docker / Supabase CLI on this machine).
- `database.types.ts` is hand-written; replace with `supabase gen types typescript` once linked.
- Onboarding screens 02, 03, 04 (ARS only), 05 and the `onboarding_completed_at` gate: next sprint, together with categories.
- Visual regression (Playwright vs design PNGs) not yet automated; welcome screen was compared manually.

## Known visual differences (screen 01)

- The mascot asset's floor shadow is lighter than in the design export; the SVG was not edited on purpose.
- Decorative coins are drawn in code (`Coin`); the `$` glyph is slightly smaller than in the export.

## Risks

- Fontsource ships all subsets (latin, latin-ext, cyrillic…); CSS is ~47 kB. Can be trimmed to latin/latin-ext later.
- `npm` blocked `esbuild`/`fsevents` install scripts (npm allow-scripts); builds work, but review with `npm install-scripts ls`.
