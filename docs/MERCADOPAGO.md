# Moni Plus billing with Mercado Pago Subscriptions

Contract: **`without-plan-pending`** (Mercado Pago Subscriptions without an associated plan, payment method chosen on
Mercado Pago's page). Offer: **"Moni Plus", ARS 2999.00 every 1 month**, defined only on the server
(`supabase/functions/_shared/plusOffer.ts`). The price in the app (`PLUS_PRICE_DISPLAY`) is display only.

> Status: scaffolded and tested against fakes only. Nothing here has been executed against Mercado Pago, deployed,
> or applied to a database. See "Known limitations" and "Not verified" before going live.

## Architecture

```
Browser (Profile / Plus sheet)
  | supabase.functions.invoke('plus-subscription', { action: 'create' })      [user JWT]
  v
plus-subscription  --- start_plus_subscription() ---> plus_subscriptions (pending, random external_reference)
  | POST https://api.mercadopago.com/preapproval  { reason, external_reference, payer_email, auto_recurring,
  |                                                  back_url = APP_URL/plus/gracias, status: 'pending' }
  v  returns only { init_point, status }  (init_point validated: https on a mercadopago domain)
Browser -> window.location.assign(init_point)  -> buyer pays on Mercado Pago -> back to /plus/gracias

Mercado Pago --webhook--> mp-webhook  (verify_jwt = false; HMAC x-signature is the authentication)
  topic subscription_preapproval          -> GET /preapproval/{id}          -> set_plus_subscription_status()
  topic subscription_authorized_payment   -> GET /authorized_payments/{id}  -> approved + amount/currency == offer
                                          -> grant_plus_from_payment()  (+1 month, idempotent on payment id)
/plus/gracias polls my_plus_status() with backoff until Plus appears.
```

Key decisions:

- **Plus is granted only by the webhook**, after re-fetching the payment from Mercado Pago. Neither the browser, the
  return page nor `plus-subscription` can credit time.
- The browser can only send an action name (`create | get | pause | reactivate | cancel`). Price, currency,
  frequency, payer e-mail (taken from the authenticated user), `external_reference` (a random uuid) and `back_url` are
  server-side.
- Service-role access is limited to `SECURITY DEFINER` functions granted to `service_role` only
  (`start_plus_subscription`, `grant_plus_from_payment`, `set_plus_subscription_status`) plus reads of the caller's own
  rows.
- Idempotency: `plus_payments.payment_id` is the primary key; a replayed notification credits nothing.
- Cancel (`cancel`) stops future charges only. The entitlement keeps running to its `expires_at`.
- The promo-code path (`redeem_promo_code`) is untouched and stacks with paid time.

Files: `supabase/migrations/20261107000000_mp_plus_billing.sql`, `supabase/tests/mp_plus_billing.test.sql` (pgTAP, not
run locally: needs a Supabase stack), `supabase/functions/{plus-subscription,mp-webhook,_shared/plusOffer.ts}`,
`src/features/plus/**`, route `/plus/gracias`.

## Secrets (Supabase secrets, NOT Vite variables)

Never prefix them with `VITE_`: everything `VITE_*` is bundled into the public JavaScript.

```bash
supabase secrets set MP_ACCESS_TOKEN=... MP_WEBHOOK_SECRET=... APP_URL=...
```

| Secret              | Where it comes from                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MP_ACCESS_TOKEN`   | Mercado Pago developer panel, your application, credentials (test tab while testing).                                                                                                           |
| `MP_WEBHOOK_SECRET` | Developer panel, your application, Webhooks, signature secret.                                                                                                                                  |
| `APP_URL`           | Public origin of the SPA, for example `https://app.example.com`. HTTPS required; `http://localhost:5173` only in dev. Only the origin is used: `back_url` = `APP_URL` origin + `/plus/gracias`. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. `ALLOWED_ORIGINS` (CORS
for `plus-subscription`) is the same secret the AI functions use; it must include the production origin.

A missing secret makes the function answer `500 { "error": "server_misconfigured" }`.

## Deploy order (needs explicit authorization, with a backup first)

1. Apply `20261107000000_mp_plus_billing.sql` (after `20261106000000_moni_plus.sql`).
2. `supabase secrets set ...` (above).
3. `supabase functions deploy plus-subscription` and `supabase functions deploy mp-webhook`
   (`verify_jwt` comes from `supabase/config.toml`: true / false respectively; do not pass `--no-verify-jwt` to the first).
4. Register the webhook in the Mercado Pago panel (below).
5. Deploy the SPA (the route `/plus/gracias` must be served: `netlify.toml` SPA fallback applies).

## Webhook registration

URL to register in the Mercado Pago panel (your application, Webhooks):

```
https://ovgzwbhfvyjwpqhyilpq.supabase.co/functions/v1/mp-webhook
```

Events to enable:

- `subscription_preapproval` (Planes y suscripciones: subscription status changes)
- `subscription_authorized_payment` (Planes y suscripciones: recurring charges)

`payments` is optional: the function ignores it (it answers 200 for unknown topics). Copy the signature secret into
`MP_WEBHOOK_SECRET`. Signature: `x-signature: ts=...,v1=...`, HMAC-SHA256 over
`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. A `ts` older than 24 hours, or more than 5 minutes in the future, is rejected (24 h because Mercado Pago retries failed deliveries for about 24 h and it is not verified that retries are re-signed; replays are harmless: processing is idempotent and always re-fetches).

Responses: `401` bad/missing/stale signature (nothing else runs), `200` handled or ignorable, `503` transient (re-fetch
failed, database error, unexpected resource shape) so Mercado Pago retries, `500` our access token is rejected.

## Test flow with test users

1. Use the application's **test credentials** for `MP_ACCESS_TOKEN` and a test-user seller/buyer pair (the
   `mp-test-setup` skill documents creating them). The payer e-mail sent is the Moni user's e-mail: for a test run,
   sign in to Moni with an account whose e-mail is the test buyer, or use the buyer test user in checkout as Mercado Pago
   requires for your account type.
2. Local: `supabase functions serve` with a `supabase/.env.local`-style secrets file (not committed) and a tunnel
   (for example ngrok) for the webhook URL.
3. In the app: Perfil, Moni Plus, **Suscribirme**. Pay on Mercado Pago with a test card (`mp-test-cards` skill).
4. Back on `/plus/gracias` the page should move from "Procesando" to "Ya sos Moni Plus".
5. Check delivery in the Mercado Pago panel (notification history) and
   `select * from plus_subscriptions; select * from plus_payments; select * from plus_entitlements;`.
6. Replay the same notification from the panel: `plus_payments` must not gain a row and `expires_at` must not move.
7. Cancel from Perfil, **Cancelar suscripción**: the subscription row becomes `cancelled`, Plus stays until
   `expires_at`.

## Go-live checklist

- [ ] Migration applied in production (with a backup); `supabase test db` green on a local stack.
- [ ] Production `MP_ACCESS_TOKEN` (production credentials), `MP_WEBHOOK_SECRET`, `APP_URL` (https) set.
- [ ] `ALLOWED_ORIGINS` includes the production origin.
- [ ] Both functions deployed; `plus-subscription` has `verify_jwt = true`, `mp-webhook` `false`.
- [ ] Webhook URL and the two events registered in the production application; signature secret copied.
- [ ] One real end-to-end charge of ARS 2999 verified, then cancelled. Confirm the real `authorized_payments` payload
      matches `parseAuthorizedPayment` (see "Not verified") and the cancel status spelling (below).
- [ ] Mercado Pago notification history shows `200` for the real notifications.
- [ ] Support copy ready for "I paid but I am not Plus" (activation can take a few minutes).

## Known limitations

- **No refunds or proration.** A refunded or charged-back payment does not remove granted time.
- **One month of Plus per approved charge** (`expires_at = greatest(now, expires_at) + 1 month`). A skipped or failed
  charge grants nothing, so Plus simply lapses; there is no grace period.
- Pausing/cancelling on Mercado Pago's own side is picked up through `subscription_preapproval` notifications and the
  `get` action. A stale notification can never reopen a `cancelled` subscription (terminal in the database).
- **Double-billing guards.** `create` is refused (`already_subscribed`) while the user has an `authorized` or `paused`
  row, and at most once per 60 seconds. Before creating, older `pending` checkouts that have a `preapproval_id` are
  cancelled on Mercado Pago (best effort; a failure is logged and creation continues) and stored as `cancelled`.
  `cancel` cancels ALL non-cancelled rows of the user. Backstop in `mp-webhook`: when a subscription becomes authorized
  (or a charge arrives) for a user who already has an OLDER authorized one, the newer duplicate is cancelled on Mercado
  Pago and earns no second month; the older one keeps granting (idempotent by payment id). If the duplicate was already
  charged, that charge is NOT refunded automatically: refund it by hand. If the duplicate was authorized first and
  credited before the older one is seen as authorized, the user keeps those credited months.
- **Rate limits** (`claim_plus_mp_call`): `get` talks to Mercado Pago at most once per 15 s per subscription (otherwise it
  returns the stored state); `pause` / `reactivate` / `cancel` answer `429 action_throttled` if the same user wrote to
  Mercado Pago in the last 5 s.
- **Create is compensated:** if Mercado Pago fails after the pending row exists, the row is stored as `cancelled`; if the
  `preapproval_id` cannot be stored (retried once), the preapproval is cancelled on Mercado Pago and the row cancelled.
- **Refunds and chargebacks do not revoke Plus time** (accepted for the MVP).
- **No reconciliation job.** If every retry of a notification fails, the paid user stays without Plus until the next
  notification or support intervenes. `GET /authorized_payments/search` and `GET /preapproval/search` appear in the
  plugin's endpoint list, but their parameters and response shape could NOT be confirmed from official pages that could
  be read, so nothing was implemented. Explicit follow-up: once confirmed, add a scheduled job that searches the
  user's recent authorized payments and feeds them through the same `decidePayment` + `grant_plus_from_payment` path.
- Only ARS 2999.00 monthly is accepted. A price change needs a new offer in `plusOffer.ts`; existing subscribers keep the
  old amount at Mercado Pago and would be IGNORED by the webhook (amount mismatch) until the offer accepts it.
- One subscription per user is assumed by the UI (it shows the authorized one, else paused, else newest).

## Not verified against official docs (check before go-live)

- The spelling of the cancel status. Only the Mercado Pago plugin guides/scripts were readable: they say `canceled`
  (one L); the official reference pages could not be fetched (404). The code tries `canceled`, on HTTP 400 retries once
  with `cancelled`, and remembers the one that worked per function instance (`_shared/mpCancel.ts`). In the first real
  test, note which spelling succeeded and make it the first one (`MP_CANCEL_STATUS`).
- Retry signing: whether a retried notification keeps the original `ts`/signature (now tolerated up to 24 h).
- Webhook event names (`subscription_preapproval`, `subscription_authorized_payment`) as delivered for this application.
- Whether cancelling an already-cancelled preapproval returns an error (the duplicate cancel in `mp-webhook` is retried
  through 503 on failure).
- The response schema of `GET /authorized_payments/{id}` (`preapproval_id`, `transaction_amount`, `currency_id`,
  `payment.id`, `payment.status`) was not in the sources available; an approved payment that does not fit is reported as
  `unexpected_shape` (503, retried, logged) rather than dropped.
- Whether `data.id` for signatures must come from the query string (the function tries body and query).
- Real `init_point` host (`mercadopago.com.ar` expected; other country domains are rejected).

## Expense auto-import (Plus): secrets and setup

Edge Function secrets for `mp-oauth`, `mp-oauth-callback`, `mp-sync` and `mp-connect-webhook` (names only; set them
with `supabase secrets set NAME=...`, never in a `VITE_*` variable, never in the repository):

| Secret | Used by | Notes |
|---|---|---|
| `MP_CLIENT_ID`, `MP_CLIENT_SECRET` | `mp-oauth`, `mp-oauth-callback`, `mp-sync` | OAuth application of Mercado Pago (not the billing `MP_ACCESS_TOKEN`). |
| `MP_OAUTH_REDIRECT_URI` | same | Exactly `https://<moni origin>/mp/callback.html`, also registered in the MP application. |
| `MP_TOKEN_KEYS` | `mp-oauth-callback`, `mp-sync` | JSON `{"<kid>": "<base64 of 32 random bytes>"}`; keeps old kids until no row uses them. |
| `MP_TOKEN_KEY_CURRENT` | same | The `kid` used to encrypt new tokens. |
| `MP_SYNC_CRON_SECRET` | `mp-sync`, `mp-oauth` (sync now) | Same value as the cron's secret (Vault or `private.app_secrets`, see `supabase/ops/mp_sync_cron.sql`). |
| `MP_CONNECT_WEBHOOK_SECRET` | `mp-connect-webhook` | HMAC key of the deauthorization webhook. |
| `MP_CONNECT_WEBHOOK_ENABLED` | `mp-connect-webhook` | `true` only after the signature manifest was captured (default off: answers `ignored:disabled`). |
| `ANTHROPIC_API_KEY` | `mp-sync` | Shared with the assistant; only the merchant text of purchases is sent (never transfers). |
| `ALLOWED_ORIGINS` | `mp-oauth`, `mp-oauth-callback` | Must include the Moni origin (e.g. `https://moni.example.com`), or the browser calls get 403. |

The static page `public/mp/callback.html` reads the API origin that the app stores in `localStorage` (`moni.mp.apiBase`)
right before leaving for Mercado Pago, so it works with a local stack or a custom auth domain. If the stored session
expired meanwhile, it parks `code`/`state` in `sessionStorage` and sends the person to `/cuentas?mp=pending`, where the
app finishes the exchange with its refreshed session.
