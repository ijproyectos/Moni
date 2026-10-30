# Offline mode

Moni is an installable PWA that keeps a cache of what you already loaded. Without internet you can
**read**; you cannot **record**. There is deliberately no offline write queue.

## What works offline

- Opening the app (the shell is precached by a service worker) and navigating between screens.
- Reading everything that was loaded before: home, activity, accounts, cards, groups, goals, fixed
  expenses, subscriptions, reports. A slim banner says "Sin conexión · Estás viendo datos guardados"
  with the time of the last successful update.
- Reloading while offline with a stored session: you stay signed in and see the cached data.
- When the connection returns the banner disappears and the visible queries are refetched.

## What is blocked, and why

Every write is blocked offline: new expenses/incomes, transfers, edits, voids, group, goal,
subscription, card and account actions, onboarding, profile edits, and AI/voice parsing. The UI shows
"Sin conexión. Conectate para guardar cambios." and the save buttons of the new-movement sheet,
transfer form and voice sheet are disabled.

Why no queue: most RPCs have no idempotency key. Replaying a queued call after a flaky reconnect
could register the same payment twice, which means duplicated money. Failing fast is the safe default.

How it is enforced (`src/shared/lib/queryClient.ts`, `src/shared/lib/offline.ts`):

- Mutations use `networkMode: 'always'`, so TanStack never pauses and replays them.
- A `MutationCache.onMutate` hook calls `assertOnline()` before any `mutationFn`; offline it throws
  `OfflineError`, which `toUserMessage` maps to the notice above. No request is made.
- Writes that are not user mutations (`process_my_due_subscriptions`, `process_my_fixed_expenses`,
  run when the app opens) call `assertOnline()` too and are simply skipped until the connection is back.

## Cache isolation

- The persisted read cache lives in IndexedDB (`idb-keyval`), one entry per user id
  (`moni-query-cache:<userId>`), and the stored entry is re-checked against the user on restore.
- `PersistedQueryProvider` is keyed by user id: a restore only happens for the current signed-in user,
  and nothing is read or written while signed out.
- Only successful read queries are saved (`shouldDehydrateQuery`); mutations never are.
- `clearUserData` (sign-out, user change, via `UserDataGuard`) clears memory, drafts and every
  persisted entry. Late throttled writes from the previous user are dropped.
- The cache expires after 7 days (`maxAge`/`gcTime`) and is discarded when the app version
  (`__APP_VERSION__`) changes (`buster`).
- If IndexedDB is unavailable or throws, the app silently runs without persistence.

## Auth while offline

supabase-js never signs out on a network failure. One gap was closed: with an expired access token
and no network, `getSession()` reports no session. `AuthProvider` falls back to the session stored in
`localStorage` in that case (and only for retryable network errors), so you are not sent to the
welcome screen. The token is refreshed automatically once the network is back.

## Service worker

Built by `vite-plugin-pwa` (Workbox, `generateSW`), production build only; there is no service worker
in `npm run dev` or in tests.

- Precaches the app shell; SPA navigation falls back to `/index.html` (same as `netlify.toml`).
- `/auth/callback` and Supabase paths are denied from the navigation fallback.
- Supabase hosts and `/rest|auth|functions|storage|realtime/v1/` use `NetworkOnly`. Requests to
  Supabase are never cached.
- `netlify.toml` serves `sw.js`, `index.html` and the manifest with `no-cache`, and hashed assets as immutable.

## Update procedure

`registerType: 'prompt'`: a new deploy installs in the background and the app shows
"Hay una versión nueva · Actualizar". Tapping it activates the new worker and reloads. The app also
checks for updates hourly. Because the persisted cache is busted by version, the first load after an
update refetches everything.

## Testing in Chrome DevTools

1. `npm run build && npm run preview`, open the preview URL (service workers need production build).
2. Application > Service Workers: confirm `sw.js` is activated; Application > Manifest shows the icons.
3. Sign in and browse a few screens so they are cached.
4. Network tab > throttling "Offline" (or Application > Service Workers > Offline). Reload: the app
   opens, the banner shows, data is visible, and the save buttons are disabled.
5. Try to save something: you get "Sin conexión. Conectate para guardar cambios.".
6. Go back online: the banner disappears and the screen refreshes.
7. To test updates: change the code, rebuild, reload, and use the "Actualizar" toast.
   Application > Storage > "Clear site data" resets the service worker and the cache.

## Future path

1. Add idempotency keys (a client-generated request id) to every money-moving RPC and make them
   idempotent on the server.
2. Only then add an outbox: persist pending mutations, replay them in order on reconnect, surface
   conflicts and failures to the user.
3. Until then offline stays read-only.
