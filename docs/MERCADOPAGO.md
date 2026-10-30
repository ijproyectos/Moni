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
`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. A `ts` more than 10 minutes away from the server clock is rejected.

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
- Each `create` leaves a `pending` row; abandoned checkouts are not cleaned up. A user can start a new checkout at most
  once per 60 seconds, and not while a subscription is `authorized`.
- Only ARS 2999.00 monthly is accepted. A price change needs a new offer in `plusOffer.ts`; existing subscribers keep the
  old amount at Mercado Pago and would be IGNORED by the webhook (amount mismatch) until the offer accepts it.
- One subscription per user is assumed by the UI (it shows the authorized one, else paused, else newest).

## Not verified against official docs (check before go-live)

- The spelling of the cancel status. The Subscriptions guide shipped with the Mercado Pago plugin says `canceled`
  (one L) and `MP_CANCEL_STATUS` uses it; reads accept both spellings. If the API rejects it, flip the constant.
- The response schema of `GET /authorized_payments/{id}` (`preapproval_id`, `transaction_amount`, `currency_id`,
  `payment.id`, `payment.status`) was not in the sources available; an approved payment that does not fit is reported as
  `unexpected_shape` (503, retried, logged) rather than dropped.
- Whether Mercado Pago re-signs retries with a fresh `ts` (the 10 minute window would reject old retries otherwise),
  and whether `data.id` for signatures must come from the query string (the function tries body and query).
- Real `init_point` host (`mercadopago.com.ar` expected; other country domains are rejected).
