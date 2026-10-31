# Proposal: Mercado Pago Expense Auto-Import (Plus)

## Intent
Plus users spend mostly via Mercado Pago (QR, debit, transfers) and must re-enter each payment by hand. Linking their own MP account via OAuth turns payer-side payments into Moni expenses automatically. The spike (obs 155) proved OAuth + /v1/payments/search work.

## Scope
### In Scope
- OAuth connect/callback/unlink (online only, server-bound `state`), consent screen (user is data controller; merchant text goes to the Claude API).
- Encrypted token storage; refresh rotation; `needs_reconnect` on invalid_grant.
- Auto-created "Mercado Pago" wallet account; import window now/30/90 days (default now).
- Polling sync ~15 min + rate-limited "sync now"; post approved ARS payer payments (regular_payment, money_transfer) directly as voidable expenses; skip inflows.
- AI category by NAME from user's list (parse-movements pattern), fallback category.
- Void on refunded/charged_back/cancelled; skip+suggest-link for MP recurring payments matching a Moni subscription.
- Dedupe vs manual entries (possible-duplicate heuristic, cross-claim guard).
- Unlink: keep movements, delete tokens, revoke at MP as far as allowed; mp-connect webhook handles MP-side unlink.

### Out of Scope
- Payments webhooks as sync source; non-ARS; inflows/income; self-transfer detection as transfers; Free tier; review queue; other banks.

## Capabilities
### New
- `mp-account-link`: OAuth link/unlink, consent, token lifecycle.
- `mp-payment-import`: polling, mapping, categorization, dedupe, voiding.
### Modified
- `transactions-dedupe`: possible-duplicate + cross-claim include imports.
- `plus-entitlements`: gate auto-import.

## Approach
Confirmed from exploration, refined:
- Tokens: `mp_connections` RLS-on, no policies, service_role only; app-level AES-GCM (key in Edge secret). Chosen over Vault: keeps key outside DB, no new extension; tradeoff: key rotation is app code.
- Sync: pg_cron -> pg_net -> `mp-sync` Edge (cron secret header); cursor minus 2-day overlap. Tradeoff vs scheduled-only client sync: works when app closed, adds new infra (pg_net, secret in DB).
- Import: SECURITY DEFINER RPC modelled on `process_subscriptions_core`; `mp_imported_payments` unique(payment_id); per-row savepoint; minimal stored fields (id, amount, date, merchant text, status).

## Affected Areas
| Area | Impact |
|---|---|
| `supabase/migrations/` | New tables, RPCs, guard changes |
| `supabase/functions/mp-oauth`, `mp-sync`, `mp-connect-webhook` | New |
| `supabase/config.toml`, `ops/` cron SQL | Modified/New |
| `supabase/tests/` pgTAP | New |
| `src/` Medios de pago (Mercado Pago account), consent, settings | Modified |

## Risks
| Risk | Lik. | Mitigation |
|---|---|---|
| Open gaps: limit/offset max, payer.id filter support, indexing delay, mp-connect payload/signature, numeric rate limits, narrower scope, public OAuth gate, payer webhooks | High | WU0 empirical checks with second test account BEFORE dependent WUs; polling-first; filter payer_id client-side |
| MP gates public OAuth apps | Med | WU0 blocks launch decision |
| Privacy (Ley 25.326, MP terms: express authorization, minimal retention, no credential storage) | Med | Explicit consent, minimal fields, tokens deleted on unlink/account deletion |
| Double-counting with manual entries | Med | Heuristic + guard extension |
| Leaked client secret (obs 155) | High | Regenerate before WU3 |

## Rollback Plan
Disable cron job and Plus flag; unlink revokes/deletes tokens; imported rows remain voidable; migrations are additive (drop new tables/functions in a down migration).

## Dependencies
Regenerated MP client secret, registered https redirect, second MP test account, pg_net.

## Success Criteria
- [ ] Approved payer payments appear within ~15 min, no duplicates on re-sync.
- [ ] Refunds void the import; unlink deletes tokens.
- [ ] Free users cannot link.

## Review Workload Forecast
~2,200-2,600 changed lines; exceeds 400 under single-pr. Chained PRs recommended: WU0 verification (no code), WU1 schema+pgTAP, WU2 import RPC/dedupe, WU3 OAuth+crypto, WU4 sync+categorization, WU5 webhook+cron, WU6 UI. Decision needed before apply: Yes. 400-line budget risk: High.
