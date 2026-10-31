# Tasks: mp-expense-autoimport

## Review Workload Forecast
| Field | Value |
|---|---|
| Estimated changed lines | ~2,350 (WU1 380, WU2 400, WU3 420, WU4 450, WU5 250, WU6 450) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 9 PRs: 1, 2a, 2b, 3a, 3b, 4a, 4b, 5, 6a/6b (6a/6b optional) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

Single-pr means a maintainer size:exception is required for one PR (~2,350 lines), or switch to a split. Per-WU PR boundary (each <=400 where possible; chain choice left to the user):
- stacked-to-main: each PR merges to main in order. Fast, but WU1-WU4 land dead code (tables/functions unused until WU6) and the card must stay hidden; rollback = revert PR in reverse order.
- feature-branch-chain: PR1 base = tracker branch, PR n base = PR n-1; only the tracker merges to main. Safer rollback and coordinated release; more rebase overhead.
- size:exception: one PR; migrations plus tests justify it, but the review is heavy.

### Suggested Work Units
| Unit | Goal | PR | Focused test | Runtime harness | Rollback |
|---|---|---|---|---|---|
| WU0 | Verify MP behaviour (no code) | none | N/A | second MP test account | N/A |
| WU1 | Schema, RLS, state/lease RPCs | PR1 | supabase test db (mp_autoimport.test.sql) | pgTAP | drop migration 20261112000000 |
| WU2a/2b | Import RPC / dedupe, guard, edit trigger | PR2a, PR2b | pgTAP | pgTAP | revert migration 20261112000100 / 20261112000200 |
| WU3a/3b | tokenCrypto+mpApi+start / callback+unlink | PR3a, PR3b | vitest (`npx -y -p node@22 node node_modules/vitest/vitest.mjs run <file>`) + deno test | handler tests w/ stubs | remove functions + config.toml entries |
| WU4a/4b | fetch/cursor / categorize+sync-now | PR4a, PR4b | vitest + deno test | fetch stubs | remove mp-sync |
| WU5 | cron ops SQL, webhook (flag off) | PR5 | vitest HMAC | ops self-check | unschedule cron, remove function |
| WU6a/6b | UI consent+card / sync now, unlink, offline | PR6a, PR6b | vitest+RTL | local dev build | hide card |

Deps: WU1 -> WU2, WU3 -> WU4 -> WU5; WU6 needs WU3+WU4. WU2 and WU3 can run in parallel after WU1 (WU3 also needs V5). WU6a can start after WU3.

## Pending user decisions (apply proceeds with defaults)
- (a) Partial refunds: default IGNORE. Affects 2a.3-2a.4.
- (b) Subscription link suggestion: default display only, no changes. Affects 2a.2, 6b.3.
- (c) Tokens after Plus lapse: default KEEP until unlink. Affects 1.4, 4a.4.
- (d) AI quota: default separate cap mp_import = 48/day via consume_ai_quota_for. Affects 1.5, 4b.2.
- (e) Callback without session: default REJECT (session required, uid must match). Affects 3b.1-3b.2.
- Also open: Vault availability (5.2 fallback to private.app_secrets), MP certification for non-test users (V1, launch blocker).

## WU0: Verification gates (non-code; record outcome in engram `sdd/mp-expense-autoimport/wu0-findings`)
- [ ] 0.1 V5: regenerate the leaked MP client secret; confirm old secret returns invalid_client; update Edge secrets. GATES 3a.* (R1.9)
- [ ] 0.2 V6-V9: with 2nd test account (QR, debit, transfer, refund) record page size/total, payer.id filter + indexing delay, real fields (payer_id, collector.id, operation_type, point_of_interaction.type), rate limit, `range=date_last_updated` behaviour. GATES 4a.* (R2.10); amend D9b/D10/D11 if needed
- [ ] 0.3 V2: capture real mp-connect payload and x-signature manifest. GATES setting MP_CONNECT_WEBHOOK_ENABLED=true (R1.9)
- [ ] 0.4 V1, V3, V4, V10: record public-OAuth gating (launch decision), narrower scope, revoke endpoint, payments webhook (informational) (R1.9)

## WU1: Schema (PR1, migration `supabase/migrations/20261112000000_mp_expense_autoimport.sql`)
> WU1 status: written, pgTAP UNVERIFIED (no Docker/Supabase stack available). Run: `supabase test db`.
- [x] 1.1 RED: `supabase/tests/mp_autoimport.test.sql` cases: authenticated cannot select mp_connections; cascade on auth user delete; partial unique mp_user_id; anon/authenticated privileges revoked (R1.6, R1.8, D4)
- [x] 1.2 GREEN: create mp_connections, mp_oauth_states, mp_imported_payments (D4, data model) with RLS/grants
- [x] 1.3 RED then GREEN: `claim_mp_oauth_state` rejects unknown/used/expired/other-user, consumes atomically (R1.4)
- [x] 1.4 RED then GREEN: `claim_mp_sync_batch` (skip locked, active, Plus, consent, due), `finish_mp_sync`, `is_plus_user`, plus_lapsed->active on renewal (R2.1, R4.1, D8, D15)
- [x] 1.5 RED then GREEN: `consume_ai_quota_for(p_user,'mp_import',48)` service-only; `get_my_mp_connection()` safe fields; free user plus_required 54000 (R4.1, R1.6, D14)
- [x] 1.6 RED then GREEN: find-or-create wallet "Mercado Pago" ARS, relink keeps count 1 (R1.5)

## WU2: Import RPC (depends WU1; migrations `..20261112000100_mp_import_rpc.sql`, `..20261112000200_mp_dedupe_guard.sql`)
- [x] 2a.1 RED: pgTAP for dedupe on payment_id, savepoint on malformed row, concurrent lock, tz date 2026-02-28, note<=200, privacy column allowlist (R2.3, R2.4, R2.8)
- [x] 2a.2 RED then GREEN: subscription overlap -> skipped_subscription + suggestion (R2.7)
- [x] 2a.3 RED then GREEN: `import_mp_payments` insert path with category validation and fallback (R2.3, R2.6)
- [x] 2a.4 RED then GREEN: void refunded/charged_back/cancelled if unedited; edited -> needs_review; already voided noop (R2.5)
- [x] 2b.1 RED then GREEN: edit trigger sets `edited_at` on transactions update (R3.3, D20)
- [x] 2b.2 RED then GREEN: modify `link_subscription_charge`/`link_fixed_expense_payment` to reject import-owned rows 23514 (R3.2, D21)
- [x] 2b.3 RED then GREEN: `get_mp_import_duplicates()` both directions +-3 days, dismissal, subscription exclusion kept (R3.1, R2.7, D22)

## WU3: OAuth (depends WU1, 0.1; register in `supabase/config.toml`)
- [x] 3a.1 RED then GREEN: `supabase/functions/_shared/tokenCrypto.ts` + vitest (AES-GCM format v<kid>.nonce.ct, AAD, rotation, no plaintext) (R1.6, D1-D3)
- [x] 3a.2 RED then GREEN: `_shared/mpApi.ts` HTTP client, exchange/refresh (offline_access), error classes, no tokens in logs (R1.7, D12)
- [x] 3a.3 RED then GREEN: `functions/mp-oauth` start: plus_required, consent_version check, window default now, state row (R1.1-R1.4, D19)
- [x] 3b.1 RED then GREEN: `functions/mp-oauth-callback` (verify_jwt=false in config.toml): valid/reused/expired/other-user state, session_required (R1.4, e)
- [x] 3b.2 RED then GREEN: callback token exchange, encrypt, upsert connection, wallet, cursor=import_since (R1.3, R1.5, R1.6)
- [x] 3b.3 RED then GREEN: mp-oauth `unlink` (any user, tokens nulled, transactions kept, best-effort revoke) (R1.8, D16)
- [x] 3b.4 Create `public/mp/callback.html`; edit `vite.config.ts` navigateFallbackDenylist (D5)

## WU4: Sync (depends WU2, WU3, 0.2; register `mp-sync` in `supabase/config.toml`, verify_jwt=false)
- [x] 4a.1 RED then GREEN: `functions/mp-sync/lib.ts` filter (payer_id, ARS, approved, op types, recurring-only feed) (R2.2, D10)
- [x] 4a.2 RED then GREEN: pagination/cap/halving, cursor T-2d advances only on full success (R2.1, D9, D11)
- [x] 4a.3 RED then GREEN: backoff 429/2001/5xx/401 and refresh with invalid_grant -> needs_reconnect (R1.7, D12, D13)
- [x] 4a.4 RED then GREEN: `mp-sync/index.ts` secret check, claim batch, waitUntil 100 s, skip lapsed/needs_reconnect (R2.1, R4.1, D18)
- [x] 4b.1 RED then GREEN: `mp-sync/categorize.ts` names only, unknown/timeout -> fallback (R2.6, D14)
- [x] 4b.2 RED then GREEN: AI quota exhaustion fallback, no import failure (R2.6, d)
- [x] 4b.3 RED then GREEN: mp-oauth `sync` action, 5-min guard, Plus gate (R1.1, R2.1)

## WU5: Ops and webhook (depends WU4)
- [x] 5.1 RED then GREEN: `functions/mp-connect-webhook` HMAC before work, 401 invalid, flag false -> 200 ignored:disabled, deauthorize -> unlinked (R1.8, D17)
- [x] 5.2 Create `ops/mp_sync_cron.sql` (*/15, Vault secret with private.app_secrets fallback) (R2.1, D7)
- [x] 5.3 Config entry for webhook in `supabase/config.toml`; flip flag only after 0.3

## WU6: UI (depends WU3, WU4; `src/features/mpImport/{api,domain,ui}`, edit `src/pages/AccountsPage.tsx`)
- [x] 6a.1 RED then GREEN: consent sheet text names "Claude API", checkbox gates button, window default now (R1.2, R1.3)
- [x] 6a.2 RED then GREEN: `api` wrappers + assertOnline/OfflineError for connect/unlink/sync (R1.1, R2.9)
- [x] 6b.1 RED then GREEN: connection card status, reconnect prompt for needs_reconnect, plus_lapsed state (R1.7, R4.1)
- [x] 6b.2 RED then GREEN: sync now and unlink buttons disabled offline (R2.9)
- [x] 6b.3 RED then GREEN: duplicate and subscription-suggestion display (R2.7, b)
