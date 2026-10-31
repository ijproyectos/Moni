# Domain 2: mp-payment-import (NEW, full spec)
## Purpose
Poll MP payments and mirror payer-side ARS payments as voidable Moni expenses.

### R2.1 Polling
Sync MUST run ~every 15 min per active connection (server-side, works with app closed) and on rate-limited sync-now. Query MUST start at cursor minus 2 days overlap. Payments webhooks MUST NOT be a sync source. Skip connections not active.
- S: GIVEN cursor T WHEN sync runs THEN begin_date = T-2d and cursor advances only after success. [Deno]
- S: GIVEN sync-now twice within the limit window THEN second call is rejected with a rate-limit error and no MP call. [Deno/pgTAP]
- S: GIVEN needs_reconnect connection WHEN cron fires THEN skipped. [Deno]

### R2.2 Filtering
A payment MUST be imported only if payer_id equals the linked MP user id, operation_type in (regular_payment, money_transfer), status = approved, currency_id = ARS. Inflows, account_fund and other operation types MUST be skipped. pending/in_process MUST be skipped until approved. Filtering MUST NOT rely on server-side payer.id filter (client-side).
- S: GIVEN payment with payer_id=other WHEN processed THEN skipped. [vitest/Deno]
- S: GIVEN operation_type=account_fund THEN skipped; GIVEN money_transfer to another person THEN imported as expense. [Deno]
- S: GIVEN currency USD THEN skipped. [Deno]
- S: GIVEN status pending WHEN synced, then approved on a later sync THEN imported exactly once, after approval. [Deno]

### R2.3 Mapping
Each import MUST create a posted expense in the Mercado Pago account with amount = transaction amount (numeric 14,2 > 0), occurred_on = approval date (fallback created date) in America/Argentina/Buenos_Aires, note <= 200 chars from merchant text, and a category (R2.6).
- S: GIVEN date_approved 2026-03-01T01:30Z WHEN imported THEN occurred_on = 2026-02-28. [pgTAP]
- S: GIVEN 300-char description THEN note length <= 200. [pgTAP]

### R2.4 Dedupe by payment_id
A unique constraint on payment_id MUST make re-sync idempotent; a failing row MUST NOT abort the batch (per-row savepoint).
- S: GIVEN payment imported WHEN same payment returned again THEN no second transaction. [pgTAP]
- S: GIVEN one malformed row in a batch THEN others import and failure is counted. [pgTAP]
- S: GIVEN concurrent syncs for the same user THEN one proceeds (lock) and no duplicates. [pgTAP]

### R2.5 Void on refund/chargeback/cancel
When a previously imported payment later reports refunded, charged_back or cancelled, the linked transaction MUST be voided if unedited; if the user edited it (amount, category, note, date or account) it MUST be flagged for attention and NOT voided. Voided rows MUST remain frozen and never deleted.
- S: GIVEN unedited import WHEN status becomes refunded THEN transaction status=voided. [pgTAP]
- S: GIVEN edited import WHEN status becomes charged_back THEN status stays posted and flag set. [pgTAP]
- S: GIVEN already voided WHEN refunded again THEN no change. [pgTAP]

### R2.6 AI categorization
Plus users' payments MUST be categorized by sending merchant text only (no ids, no payer data) and the model MUST return a category NAME from the user's own list; unknown, empty or failed responses MUST map to a fallback category. The import MUST NOT fail on AI failure/quota exhaustion.
- S: GIVEN names [Comida, Transporte] and model returns "Comida" THEN category_id is that user's Comida. [Deno/pgTAP]
- S: GIVEN model returns a name not in the list THEN fallback category. [Deno]
- S: GIVEN AI timeout THEN expense imported with fallback and sync continues. [Deno]

### R2.7 Overlap with subscriptions and manual entries
An MP payment with recurring type matching a Moni subscription (same amount/period heuristic) MUST NOT be posted as expense; it MUST be recorded as skipped and surfaced as a suggestion to link. A payment matching an existing manual expense (same account+amount, date +-3 days) MUST be imported flagged possible-duplicate, not silently dropped.
- S: GIVEN subscription "Netflix" 5000 ARS and recurring MP payment 5000 THEN no expense, suggestion created. [pgTAP]
- S: GIVEN manual expense 1200 on 05-01 and MP payment 1200 on 05-02 THEN import appears with possible-duplicate flag. [pgTAP]

### R2.8 Privacy
Stored import fields MUST be limited to payment id, amount, date, merchant text, status (and mapping ids). Full payloads, payer personal data, card data and credentials MUST NOT be stored or logged.
- S: GIVEN imported row THEN columns match the allowlist. [pgTAP]
- S: GIVEN error logs THEN only status/class appear, no tokens or payload. [Deno]

### R2.9 Offline behaviour
Imported expenses MUST appear on next online fetch; no client write queue is used.
- S: GIVEN offline app WHEN opening list THEN cached data shown; sync-now disabled. [vitest]

### R2.10 Verification gates (WU0)
UNVERIFIED: V6 limit/offset maximum and pagination total (record safe page size); V7 payer.id filter support and indexing delay (record delay, validates 2-day overlap); V8 real fields payer_id, collector.id, operation_type, point_of_interaction.type for QR, debit and transfer; V9 numeric rate limit; V10 payments webhooks for payer side (informational, not required). Design MUST remain correct if V7 shows delay > 2 days or V10 is negative.
- S: GIVEN second test account makes QR, transfer and refund WHEN queried THEN results recorded and spec assumptions confirmed/amended. [manual-WU0]
