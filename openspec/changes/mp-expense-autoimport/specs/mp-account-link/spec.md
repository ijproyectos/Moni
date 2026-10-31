# Spec: mp-expense-autoimport (4 domains, concatenated)
Test tags: [pgTAP] [vitest] [Deno] [manual-WU0]. UNVERIFIED items are verification scenarios, not asserted behaviour.

# Domain 1: mp-account-link (NEW, full spec)
## Purpose
Link/unlink a user's own Mercado Pago (MP) account via OAuth and manage token lifecycle.

## Requirements
### R1.1 Plus gate and online-only
Link, unlink and sync-now MUST be online-only and MUST require an active Plus entitlement (link/sync-now); unlink MUST work for any user holding a connection.
- S: GIVEN free user WHEN requesting a connect URL THEN server refuses with plus_required and no state row is created. [pgTAP/Deno]
- S: GIVEN device offline WHEN user taps connect, unlink or sync-now THEN action is disabled/OfflineError and nothing is queued. [vitest]

### R1.2 Consent screen
Before redirecting to MP the app MUST show consent text stating: user is data controller; payment merchant text is sent to the Claude API for categorization; only minimal fields are stored; credentials are never stored. Connect MUST be impossible without explicit acceptance.
- S: GIVEN consent screen WHEN rendered THEN text names "Claude API" and the connect button is disabled until the checkbox is ticked. [vitest]
- S: GIVEN no acceptance WHEN connect endpoint is called THEN it refuses. [Deno]

### R1.3 Import window choice
User MUST choose now / last 30 days / last 90 days; default MUST be "from now". The chosen window MUST be persisted at connect and bound the first sync.
- S: GIVEN no selection WHEN connect starts THEN window = now. [vitest]
- S: GIVEN window=30 WHEN first sync runs THEN payments older than 30 days are not imported. [Deno]

### R1.4 State/CSRF binding
The OAuth `state` MUST be server-generated, single-use, bound to the authenticated user, and expire (10 min max). Callback MUST reject unknown, reused, expired or other-user state without exchanging the code.
- S: GIVEN valid state WHEN callback arrives with code THEN tokens are stored and state consumed. [Deno]
- S: GIVEN reused or expired state WHEN callback arrives THEN no token exchange, user sees error. [Deno]
- S: GIVEN state minted for user A WHEN callback is completed in user B session THEN rejected. [Deno]

### R1.5 Auto-created wallet account
On first successful link the system MUST create a wallet account named "Mercado Pago" (ARS) if the user has none, reusing it otherwise; relinking MUST NOT create a second one.
- S: GIVEN no MP account WHEN link completes THEN exactly one wallet "Mercado Pago" exists. [pgTAP]
- S: GIVEN existing account WHEN relinked THEN count stays 1. [pgTAP]

### R1.6 Token storage
Tokens MUST be encrypted at rest (app-level AES-GCM), the table MUST be unreadable by anon/authenticated (RLS on, no policies, privileges revoked); clients MUST see only a safe status view (status, mp_user_id, since, last_sync). Tokens MUST NOT appear in logs or responses.
- S: GIVEN authenticated user WHEN selecting mp_connections directly THEN permission denied/zero rows. [pgTAP]
- S: GIVEN stored row WHEN inspected THEN token columns are not plaintext. [Deno]

### R1.7 Token lifecycle
Access token lifetime is 180 days; refresh token MUST be rotated on every refresh and the new one persisted atomically; refresh MUST send offline_access. On invalid_grant (400) status MUST become needs_reconnect and sync MUST stop for that connection.
- S: GIVEN expiring access token WHEN sync runs THEN refresh happens and the new refresh token replaces the old. [Deno]
- S: GIVEN refresh returns invalid_grant WHEN sync runs THEN status=needs_reconnect, no further MP calls until relink; UI shows reconnect prompt. [Deno/vitest]
- S: GIVEN 429 local_rate_limited WHEN syncing THEN connection stays active and retries next cycle. [Deno]

### R1.8 Unlink
Unlink MUST delete stored tokens, MUST attempt MP-side revocation as far as MP allows (no app-side revoke endpoint is documented; best effort), and MUST keep all imported movements. The mp-connect webhook MUST (after x-signature verification before any work, 200/201 within 22 s, idempotent) mark the connection unlinked and delete tokens when MP reports deauthorization. Account deletion MUST delete tokens.
- S: GIVEN linked user WHEN unlinking THEN tokens are gone, status=unlinked, transactions unchanged. [pgTAP/Deno]
- S: GIVEN valid-signature deauthorize event WHEN received THEN connection unlinked; invalid signature -> 401 and no change. [Deno]
- S: GIVEN auth user deleted WHEN cascade runs THEN no mp_connections row remains. [pgTAP]

### R1.9 Verification gates (WU0, blocks dependent WUs)
UNVERIFIED items below MUST be resolved empirically with a second MP test account before dependent work units start; outcomes MUST be recorded.
- V1: authorize a non-owner test user -> record whether public OAuth is gated (blocks launch decision).
- V2: capture real mp-connect payload and x-signature manifest -> record before WU5.
- V3: check whether a narrower scope than read/write/offline_access is accepted.
- V4: confirm whether MP exposes any revoke endpoint.
- V5: regenerate leaked client secret before WU3 (checked: old secret returns invalid_client).
