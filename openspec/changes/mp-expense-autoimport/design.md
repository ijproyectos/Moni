# Design: Mercado Pago Expense Auto-Import (Plus) — rev 2 (aligned to spec obs 162)

## Technical Approach
Polling-first, server-only pipeline. OAuth via two Edge Functions: `mp-oauth` (JWT) and `mp-oauth-callback` (authenticated by the state plus a matching session). Tokens are AES-256-GCM ciphertext in a service-only table. pg_cron + pg_net call `mp-sync` every 15 min; it refreshes tokens, pages `/v1/payments/search`, filters payer-side ARS spends client-side, categorizes by NAME via Claude, and calls the SECURITY DEFINER RPC `import_mp_payments`. That RPC follows `process_subscriptions_core`: one sub-transaction per payment, ON CONFLICT on `payment_id`, void on refund. Every UNVERIFIED MP behaviour has a fallback and a WU0 gate. Binding decisions 1-A..9-A apply. Import window default = "from now" (4-A, R1.3): `import_since` = link time unless the user picks 30 or 90 days.

## Architecture Decisions
| # | Topic | Choice | Rejected (tradeoff) |
|---|---|---|---|
| D1 | Token storage | App-level AES-256-GCM. Keys in Edge secrets `MP_TOKEN_KEYS` (JSON kid->b64 32B) and `MP_TOKEN_KEY_CURRENT`. Format `v<kid>.<b64url nonce12>.<b64url ct+tag>`; AAD `user_id\|column` | Vault/pgsodium: key in the DB |
| D2 | Nonce | Random 96-bit per encryption; re-encrypt on every write; low volume -> negligible collision risk | Counter nonce (stateful) |
| D3 | Key rotation | Add a kid and flip CURRENT. Decrypt by kid; refresh re-wraps; `mp-sync?rewrap=1` re-wraps leftovers. Remove the old kid when `count(*) where key_version <> current and (access_token_enc is not null or refresh_token_enc is not null) = 0`. `key_version` is set NULL whenever the ciphertexts are nulled (D13/D16) | Big-bang re-encrypt |
| D4 | Client visibility | `mp_connections`: RLS on, no policies, privileges revoked from public/anon/authenticated, service_role only. Clients use `get_my_mp_connection()` (DEFINER: status, mp_user_id, import_since, last_sync_at, last_error_class) | View (column-leak risk) |
| D5 | redirect_uri | Static `public/mp/callback.html` on the Moni domain (outside the SPA router, in the PWA `navigateFallbackDenylist`). It POSTs `{code, state}` plus the same-origin Supabase session JWT, if any, to `mp-oauth-callback`, then goes to `/cuentas?mp=ok/error` | Edge URL (not the Moni domain); SPA route (strips `?code`) |
| D6 | State binding (R1.4) | 32 random bytes; only the sha256 is stored in `mp_oauth_states(user_id, import_window, consent_version, expires_at 10 min, used_at)`. `claim_mp_oauth_state(hash, caller_uid)` consumes atomically and REJECTS unknown, used, expired, or `caller_uid <> user_id`. Default: the callback REQUIRES a session JWT whose uid equals the state's user; no session -> `session_required` error and nothing is exchanged ("open Moni in this browser and retry"). State-only acceptance is open question (e) | — |
| D7 | Cron | `ops/mp_sync_cron.sql` (manual ops): `*/15` -> `net.http_post` with the URL and `x-moni-cron-secret` read from Vault `decrypted_secrets`. Fallback without Vault: service-only table `private.app_secrets` (schema not exposed to the API, privileges revoked) read inside the cron command, so the secret never appears in `cron.job` or `job_run_details` text. Residual risk: readable by the postgres role. Mitigation: the secret only triggers a sync (no data returned, idempotent work); rotate it by updating the row and the Edge secret together | Literal in the cron command (leaks into job metadata) |
| D8 | Per-user lock | Lease `sync_lease_until` via `claim_mp_sync_batch(n)` (`for update skip locked`; active, Plus, consent present, due). Plus `pg_advisory_xact_lock(hashtextextended('mp_import:'\|\|owner,0))` in the import RPC | Session advisory locks (pooling) |
| D9 | Cursor (R2.1) | Window `[cursor_at - overlap, run_end]`, overlap = `MP_SYNC_OVERLAP_DAYS` (default 2). `cursor_at := run_end` ONLY after the whole run completes (all pages imported, no error). Partial run (deadline, 429, error, page cap) -> cursor unchanged; the next run re-reads from the old cursor, which is safe because of dedupe on `payment_id`. Page cap hit -> the run shrinks `run_end` (halving) so a smaller window completes and the cursor advances to that end. Primary query `range=date_last_updated` (UNVERIFIED, V7/V8) | Per-page cursor advance (contradicts R2.1) |
| D9b | Fallbacks (R2.10) | (1) If WU0 shows `range=date_last_updated` unsupported, or that it does not surface refunds: use `range=date_created` for the main window plus a daily reconciliation pass by creation date over the last 60 days, which picks up status changes of imported payments. (2) If the V7 indexing delay is > 2 days: set the overlap to the measured delay + 1 day, and the daily pass covers 30 days by creation date. Idempotency keeps both correct. Gate: WU0 V7/V8 before WU4 | Trusting one window as fact |
| D10 | Filter (R2.2) | Client-side: `payer_id == mp_user_id`, `collector.id <> mp_user_id`, `currency_id=ARS`, status approved for new imports. Imported operation types: ONLY `regular_payment`, `money_transfer`. A recurring-type payment (expected `recurring_payment`, V8) only feeds the subscription check (RPC step 1); anything else is dropped unstored. `payer.id` is sent as a query filter only if V7 confirms | Trusting `payer.id` |
| D11 | Pagination | `limit=50` until V6; offset loop to `paging.total` or an empty page; cap of 20 pages per run; error 1000 -> halve the window | Big limits pre-WU0 |
| D12 | Backoff | 429: 1/2/4 s with jitter, then stop the connection as `rate_limited` (stays active, R1.7). 2001 -> skip this run. 5xx -> transient. 401 -> one refresh, then `needs_reconnect` | Unbounded retry |
| D13 | Refresh | When `expires_at < now()+7d` or on 401; send `offline_access`; persist the new refresh token before using the new access token. `invalid_grant` -> null the ciphertexts and `key_version`, status `needs_reconnect` | Keeping dead tokens |
| D14 | AI | One Claude call per page of NEW payments (`mp_new_payment_ids` pre-check). Merchant text only; the model returns NAMES; name->id mapping in Edge; the RPC re-validates. Default quota: service-only `consume_ai_quota_for(p_user,'mp_import',48)`, a SEPARATE cap from the assistant (open question d). Failure or exhaustion -> fallback category ('Otros', else the first active expense category) | Ids from the model |
| D15 | Plus (R4.1) | `is_plus()` in `start`; service-only `is_plus_user(p_user)` in the claim and import RPCs. Lapsed -> status `plus_lapsed`, no MP calls, movements and tokens KEPT (purged only on unlink; open question c). Renewal -> back to `active` without relinking | 30-day purge (unconfirmed) |
| D16 | Unlink (R1.8) | Null the ciphertexts and `key_version`, status `unlinked`, keep the transactions; revoke at MP best-effort if V4 finds an endpoint; the UI links to MP connected apps. Allowed for lapsed users | Deleting movements |
| D17 | mp-connect webhook (R1.8, MUST) | Ships in WU5: `verify_jwt=false`; HMAC `x-signature` check before any work (mp-webhook pattern); idempotent; 200 within 22 s. Valid deauthorize -> status `unlinked` + delete tokens. Behind flag `MP_CONNECT_WEBHOOK_ENABLED` (default false): while false it answers 200 `ignored:disabled` without work. WU0 V2 flips the flag once the manifest is captured. Interim safety net: the invalid_grant/401 path -> `needs_reconnect` within 15 min | Optional webhook |
| D18 | Edge runtime | 202 + `EdgeRuntime.waitUntil`, 100 s deadline. Fallback if unsupported: synchronous run with batch n=5 | Long synchronous run under the pg_net timeout |
| D19 | Consent (R1.2) | `start` requires `{accepted:true, consent_version}` equal to the server constant `MP_CONSENT_VERSION`, else `consent_required`. The version is stored in the state row and copied to `mp_connections.consent_version`/`consented_at` at callback; claim_mp_sync_batch skips rows without consent | Client-only checkbox |
| D20 | Edit marker (R2.5/R3.3) | `mp_imported_payments.edited_at`, set by an AFTER UPDATE trigger on `transactions` (SECURITY DEFINER, `when` amount, category_id, note, occurred_on or account_id IS DISTINCT FROM old) for rows referenced by an import. The import RPC's void touches only `status`, so it never marks. Void requires `edited_at is null` | Comparing a stored snapshot |
| D21 | Cross-claim (R3.2) | An MP import is a third claim owner. `link_subscription_charge` and `link_fixed_expense_payment` reject a transaction referenced by `mp_imported_payments` (`invalid_link`, 23514); unclaimed expenses link as before. The refund void additionally skips rows owned by a charge or fixed payment (defensive -> `needs_review`) | — |
| D22 | Duplicates (R2.7/R3.1) | Computed at READ time, both directions: `get_mp_import_duplicates()` pairs each posted import with a posted non-import expense on the SAME account with equal amount and occurred_on +-3 days, not owned by a charge, fixed payment or another import, and not dismissed (`duplicate_dismissed`). A manual entry added AFTER the import is caught on the next read. Existing subscription/fixed heuristics keep their exclusions | Flag stored at import time (misses later manual entries) |

## Data Model (migration `20261112000000_mp_expense_autoimport.sql`)
- `mp_connections(user_id pk fk auth.users cascade, mp_user_id, status check(active, needs_reconnect, plus_lapsed, unlinked), access_token_enc, refresh_token_enc, key_version, expires_at, account_id fk accounts, import_since, cursor_at, sync_lease_until, last_sync_at, last_sync_status, last_error_class, consecutive_failures, last_manual_sync_at, consent_version, consented_at, created_at, updated_at)`. Partial unique index on `mp_user_id where status <> 'unlinked'`: active, needs_reconnect and plus_lapsed rows all reserve the MP account. A second Moni user gets `mp_account_in_use`; the same user relinking updates their own row.
- `mp_oauth_states(state_hash pk, user_id, import_window check(now,30,90) default 'now', consent_version, expires_at, used_at)`: service-only.
- `mp_imported_payments(payment_id text pk, owner_id, transaction_id fk null, mp_status, outcome check(posted, voided, skipped_subscription, needs_review), amount numeric(14,2), occurred_on, merchant varchar(120), operation_type, suggested_subscription_id, edited_at, duplicate_dismissed bool, imported_at, updated_at)`. Authenticated may SELECT own rows only.

## Import RPC
`import_mp_payments(p_owner, p_payments jsonb) returns jsonb {posted, voided, skipped, failed}`, service_role only, per element begin/exception:
1. Recurring type, unseen: an active subscription with equal amount and a due date (charge due_on or next_charge_on) within +-3 days -> `skipped_subscription` plus a suggestion (display only, open question b). No match -> dropped, not stored.
2. regular_payment/money_transfer approved, unseen: insert the transaction (connection account, else `account_unavailable` for the batch; validated category, else fallback; `occurred_on = (coalesce(date_approved, date_created) at time zone 'America/Argentina/Buenos_Aires')::date`; note = `left(merchant, 200)`).
3. Seen + refunded/charged_back/cancelled: void if posted, `edited_at is null`, and not owned by a charge or fixed payment; otherwise `needs_review`. Already voided -> noop. Partial refunds ignored (open question a).

## Sequences
Connect: consent sheet (window default "now", checkbox) -> assertOnline -> `mp-oauth` start (JWT, is_plus, consent_version, rate limit) -> state row -> MP -> `/mp/callback.html` -> POST code, state, session JWT -> `claim_mp_oauth_state` (user match) -> token exchange -> encrypt -> upsert connection + find-or-create wallet "Mercado Pago" -> `cursor_at = import_since` -> `/cuentas?mp=ok`.
Sync: cron -> pg_net -> `mp-sync` (constant-time secret check) -> claim batch -> per user: decrypt -> refresh? -> page -> filter -> new ids -> AI -> import -> on complete run `finish_mp_sync(ok, run_end)` else `finish_mp_sync(partial/error, class)` with the cursor unchanged. Sync now = `mp-oauth` `sync` action (5-min `last_manual_sync_at` guard) using the same core.

## File Changes
Create: the migration; `functions/_shared/{tokenCrypto, mpApi}.ts` (mpApi = HTTP client, token exchange/refresh, error classes); `functions/mp-oauth/`, `mp-oauth-callback/`, `mp-sync/{index, lib, categorize}.ts`, `mp-connect-webhook/`; `ops/mp_sync_cron.sql`; `supabase/tests/mp_autoimport.test.sql`; `public/mp/callback.html`; `src/features/mpImport/{api, domain, ui}`. Modify: `config.toml` (callback, sync and webhook with `verify_jwt=false`), `AccountsPage.tsx`, `vite.config.ts`, and `link_subscription_charge`/`link_fixed_expense_payment` (D21).

## Observability
`last_sync_at`, `last_sync_status(ok, partial, error)`, `last_error_class(rate_limited, mp_unavailable, token_invalid, account_unavailable, category_unavailable, config, unexpected)`, `consecutive_failures`. Logs carry label, class and HTTP status only.

## Work Units
| WU | Scope | ~Lines | Gate / deps | Tests |
|---|---|---|---|---|
| WU0 | V1-V10 + secret regeneration (V5) | 0 | V5 before WU3; V6-V9 before WU4; V2 before the WU5 flag flip | findings in engram |
| WU1 | Tables, RLS/grants, state/lease/status RPCs, is_plus_user, consume_ai_quota_for | 380 | — | pgTAP |
| WU2 | Import RPC, edit trigger, D21/D22 | 400 (split 2a RPC / 2b dedupe+guard+trigger if > 400) | WU1 | pgTAP |
| WU3 | tokenCrypto, `_shared/mpApi.ts`, mp-oauth start/unlink, callback | 420 (split 3a crypto+mpApi+start / 3b callback+unlink) | WU1, V5; owns mpApi, so there is NO dependency on WU4 | vitest (Node 22 WebCrypto), Deno handler tests |
| WU4 | mp-sync core, categorize, `sync` action added to mp-oauth | 450 (split 4a fetch/cursor / 4b categorize+sync-now) | WU2, WU3, V6-V9 | vitest fetch stubs, Deno |
| WU5 | cron ops SQL, mp-connect-webhook (flag off) | 250 | WU4; V2 flips the flag | vitest HMAC, ops self-check |
| WU6 | UI: consent, card, sync now, unlink, offline | 450 (split 6a/6b) | WU3, WU4 | vitest + RTL |

## Threat Matrix
N/A: no shell, subprocess, VCS/PR automation, executable-file classification or agent routing boundary.

## Rollout
Additive migration; manual cron; the kill switch is unscheduling the cron plus hiding the card. Apply only with explicit authorization and a backup.

## Open questions for the user (conservative defaults applied)
- [ ] (a) Partial refunds: default IGNORE (no amount adjustment).
- [ ] (b) "Suggest linking": default shows the suggestion only and changes nothing.
- [ ] (c) Tokens after Plus lapses: default KEEP until unlink (no 30-day purge).
- [ ] (d) AI quota for import: default separate cap `mp_import` = 48 calls/day via consume_ai_quota_for, not shared with the assistant.
- [ ] (e) Callback without a session: default REJECT (session required, uid must match the state). Alternative: accept the state alone.
## Other open questions
- [ ] Vault availability on the current plan.
- [ ] MP app certification for non-test users (V1, blocks launch).
- [ ] Merchant->category memo (v2).
