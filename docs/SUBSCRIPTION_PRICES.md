# Subscription reference prices

When a person picks a service and plan in Gastos recurrentes > Suscripciones, the amount field is prefilled
with `USD price x dolar tarjeta rate` (editable, labelled "Precio de referencia, puede variar").

## Where things live

| Piece | File |
| --- | --- |
| Prices (single data file) | `src/features/subscriptions/domain/referencePrices.ts` |
| Pure conversion + date label | `src/features/subscriptions/domain/conversion.ts` |
| Rate fetch + validation | `src/features/subscriptions/api/dollarCardRate.ts` |
| TanStack Query hook | `src/features/subscriptions/api/useDollarCardRate.ts` |

## Rate

- Source: `https://dolarapi.com/v1/dolares/tarjeta` (public, no key, CORS open). Field `venta` is used.
- Validated at runtime (`moneda=USD`, `casa=tarjeta`, finite `venta` between 1 and 100000, ISO date).
- 6 s timeout, `staleTime` 30 min, no retry. It is cached like any other read in the per-user persisted
  cache, so it is wiped on sign-out. If a refresh fails or the device is offline, the last cached rate is
  used and the UI says "Cotizacion del dd/mm"; with no cached rate nothing is suggested.
- The rate is never hardcoded. No Content-Security-Policy is configured (index.html, netlify.toml), so no
  `connect-src` change was needed; add `https://dolarapi.com` there if a CSP is introduced.

## Limitation

The server charges the saved ARS amount. The amount does NOT follow the dollar afterwards; the person has
to edit the subscription to update it. Taxes (IVA, percepciones) are not included in the reference price.

## Rules for prices

1. Only from the service's official pricing page. Record `sourceUrl` and `checkedOn` (YYYY-MM-DD) per entry.
2. If a price cannot be verified, do not add it (the form then behaves as before).
3. `plan` must equal a plan name in `catalog.ts`; `yearlyUsd` is the total per year.
4. Services that bill in pesos (Netflix, Spotify, Disney+...) have no entry.
5. `referencePrices.test.ts` checks positive finite prices, https source, date, and catalog consistency.

## Verified on 2026-10-30

| Service / plan | Monthly USD | Yearly USD | Source |
| --- | --- | --- | --- |
| Claude Pro | 20 | 200 | https://claude.com/pricing |
| Cursor Ultra | 200 | - | https://cursor.com/pricing |
| GitHub Copilot Pro | 10 | - | https://github.com/features/copilot/plans |
| GitHub Copilot Pro+ | 39 | - | https://github.com/features/copilot/plans |
| ElevenLabs Starter | 6 | 60 | https://elevenlabs.io/pricing |
| ElevenLabs Creator | 22 | 220 | https://elevenlabs.io/pricing |
| ElevenLabs Pro | 99 | 990 | https://elevenlabs.io/pricing |

## Not verified (left empty on purpose)

ChatGPT, Midjourney, Notion, Canva, NordVPN (official page blocked automated access); Gemini (price not in
the fetched page); Perplexity (price not in the fetched page); Claude Max (tiered "from" price); Cursor Pro
(plan no longer listed under that name); Suno, Runway, Dropbox Plus (monthly vs yearly toggle ambiguous);
Adobe and other catalog services (not checked). Add them once confirmed on the official page.
