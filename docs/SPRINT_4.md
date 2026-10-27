# Sprint 4 — Shared expenses, data + domain + API (Phase C1)

Status: written locally, not committed, not deployed. Nothing was run against Supabase: neither this migration nor its pgTAP suite has executed. The UI (Phase C2) is documented in the "UI" section at the end.

## Accounting model: "solo tu parte cuenta como gasto tuyo"

Payment is not consumption.

- A shared expense stores who paid the full amount (`paid_by`) and each participant's `share_amount`.
- Personal **expense** statistics (`get_month_summary`) add only the caller's own share of posted shared expenses. Shares are grouped under the caller's own non-archived expense category whose name matches the template name; otherwise under a virtual category (`category_id = 'template:<slug>'`, template name/icon/color; `'template:none'` / "Gastos compartidos" when the expense has no template).
- If the payer links an account, `create_shared_expense` creates a `shared_payment` transaction for the full amount. It lowers that account's balance and never enters income/expense.
- Settlements (`from_user` pays `to_user`) are balance movements. `settlement_out` (payer's account, optional) and `settlement_in` (receiver records it later into their own account) never enter income/expense and never duplicate the original expense.
- Members are registered users who joined by invite code. Nobody sees another member's accounts or personal transactions.
- Per member: `net = paid - owed + settled_out - settled_in` over posted rows. Positive: the group owes them. Nets add up to zero.

### Worked examples (all numbers ARS)

1. Ana pays 100.00 for dinner split equally among Ana, Beto, Dani, linked to her Caja (1.000): shares Ana 33.34 (the payer gets the extra cent), Beto 33.33, Dani 33.33. Ana's Caja: 900. Ana's October expense: 33.34. Beto's: 33.33. Dani's: 33.33. Nets: Ana +66.66, Beto -33.33, Dani -33.33.
2. Ana pays 100.01 for the two others only (Beto, Dani). The payer is not in the split, so the extra cent goes to the lowest user id: Beto 50.01, Dani 50.00. Ana's expense stat does not change; her net grows by 100.01.
3. Beto settles 83.34 to Ana from his Caja: Beto's Caja drops 83.34, Beto's net +83.34. Ana's net drops by 83.34. Neither income nor expense changes. Ana later records the receipt into her Banco: +83.34 in that account, still not income.
4. Percent split 100.01 with 33.33 / 33.33 / 33.34 %: floor(10001 x pct / 100) = 3333 / 3333 / 3334, 1 cent left to the payer if a participant.

Rounding rule (SQL and `computeSplit` in TypeScript): equal base = floor(total / n); percent base = floor(total x percent / 100); leftover cents go one each, first to the payer (if a participant), then by ascending user id.

## Schema (`supabase/migrations/20261027000000_shared_expenses.sql`)

| Table                   | Notes                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `groups`                | name 1..60, kind casa/viaje/pareja/amigos, currency ARS, `archived_at`                                                                                       |
| `group_members`         | pk (group, user), role owner/member, `left_at` (left members stay listed; re-join restores the row)                                                          |
| `group_invites`         | unique 12-char code (alphabet without I, O, 0, 1), `expires_at` default +7 days, `max_uses` default 20, `uses`, `revoked_at`                                  |
| `shared_expenses`       | amount > 0, description 1..120, optional `template_slug`, `split_method` equal/percent, posted/voided                                                        |
| `shared_expense_splits` | pk (expense, user), `share_amount >= 0`, `percent`; carries `group_id` (composite FK) so RLS needs no join; immutable (trigger)                              |
| `settlements`           | `from_user <> to_user`, amount > 0, note <= 200, posted/voided                                                                                               |
| `transactions` (alter)  | FK `shared_expense_id`, new `settlement_id`; unique live `shared_payment` per expense and live out/in per settlement; check that link columns match the kind |

Conventions kept: `numeric(14,2)`, ARS only, posted/voided + `voided_at`, voided rows immutable (`guard_status_transition`), no DELETE grants anywhere, NO ACTION foreign keys, every function `set search_path = ''`, column-level grants, RLS on all tables, anon gets nothing, Argentina local date defaults, internal/trigger functions revoked from public/anon/authenticated.

## RLS

- Clients have **SELECT only** on the six new tables. No INSERT/UPDATE/DELETE grants: every write is an RPC.
- Policies: `public.is_group_member(group_id)` (security definer, active membership: `left_at is null`) on groups, members, invites, expenses, splits, settlements. Non-members read nothing; invite codes are visible only to members of that group.
- Co-member names come from `get_group_members`; the `profiles` policy is untouched.
- **Policy change on the existing table** (done with drop/create in the new migration, the old migration is untouched): `transactions_update_own` now requires `kind in ('expense','income')`. Before this, an owner could edit the amount or void a `shared_payment` / `settlement_*` transaction and desynchronize it from its expense.

## RPCs (authenticated only; anon and public revoked)

| RPC                                                                                                                                                    | Behavior                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_group(name, kind)`                                                                                                                             | creator becomes owner                                                                                                                                                                                 |
| `create_group_invite(group)`                                                                                                                           | members only, max 5 active invites (not revoked, not expired, not exhausted)                                                                                                                          |
| `revoke_group_invite(invite)`                                                                                                                          | invite creator or group owner (extra, not in the original list: without it the 5-invite limit could lock a group for 7 days)                                                                          |
| `join_group(code)`                                                                                                                                     | locks group then invite (same order as `revoke_group_invite`), validates, increments `uses` atomically; idempotent for members; re-join restores membership. Every invalid state (unknown, expired, revoked, exhausted, archived group) returns NULL after recording the failed attempt in `group_join_attempts` (the client raises the uniform `invite_invalid`); 10 failed attempts in an hour raise `too_many_attempts`                                                                  |
| `leave_group(group)`                                                                                                                                   | only with net 0; promotes the longest-standing member if no owner remains; the last active member leaving archives the group and revokes all its invites                                                                                                                             |
| `get_group_members(group)`                                                                                                                             | `user_id, display_name, avatar_url, role, joined_at, left_at`; raises `not_group_member` otherwise                                                                                                    |
| `create_shared_expense(group, amount, description, template_slug, occurred_on, paid_by, split_method, participants[], percents[]?, payer_account_id?)` | any active member can register it; payer and participants must be active members; percents > 0, <= 2 decimals, sum exactly 100; `payer_account_id` requires caller = payer and an own, active account |
| `void_shared_expense(expense)`                                                                                                                         | creator, payer or any participant; voids the linked `shared_payment`; idempotent                                                                                                                                       |
| `create_settlement(group, to_user, amount, occurred_on?, note?, account_id?)`                                                                          | `from_user` = caller; optional `settlement_out` on the caller's own account                                                                                                                           |
| `record_settlement_receipt(settlement, account)`                                                                                                       | only `to_user`; creates `settlement_in` once (idempotent, returns the transaction id)                                                                                                                 |
| `void_settlement(settlement)`                                                                                                                          | `from_user`, `to_user` or creator; voids both sides' linked transactions; idempotent                                                                                                                             |
| `get_group_balances(group)`                                                                                                                            | `{ members: [{ user_id, display_name, paid, owed, settled_out, settled_in, net }] }`                                                                                                                  |
| `get_my_groups()`                                                                                                                                      | `id, name, kind, role, member_count, my_net, last_activity` for active, non-archived groups                                                                                                           |
| `get_month_summary(month)`                                                                                                                             | same signature/shape; adds own shares (through `my_shared_shares`, a definer helper strictly filtered by `auth.uid()` so leaving a group does not rewrite your history); `recent` still month-scoped  |

Internal (not callable by clients): `lock_group_as_member` (locks the group row to serialize balance-changing writes, then requires membership), `group_balance_rows`, `forbid_row_mutation`.

Design decisions:

- Voiding an expense or settlement is blocked (`participant_left`) when a payer/participant already left, because it would silently break their zero balance.
- Error codes (message = code): `not_group_member`, `group_archived`, `invite_invalid|limit_reached`, `too_many_attempts`, `balance_not_zero`, `invalid_amount|description|participants|percent|split_method`, `percents_must_sum_100`, `participant_not_member`, `payer_not_member`, `payer_account_requires_payer`, `account_not_found|archived`, `not_allowed`, `not_settlement_receiver`, `participant_left`, and more; all mapped to Spanish in `src/shared/lib/errors.ts`.

## Client (`src/features/groups`)

- `domain/split.ts`: `computeSplit` (equal/percent in cents, mirrors SQL, BigInt for percent), `validateSplit`, `simplifyDebts` (greedy, deterministic, cents).
- `domain/group.ts`: types, `groupFormSchema`, `joinGroupSchema` (code normalization), `sharedExpenseFormSchema` (amount string to cents, participants, per-participant percents to an aligned array), `settlementFormSchema`.
- `api/`: `groupsRepository.ts` and `useGroups.ts` with user-scoped keys (`['groups', userId, ...]`). Queries: `useMyGroups`, `useGroup`, `useGroupMembers`, `useGroupBalances`, `useSharedExpenses`, `useSettlements`. Mutations: `useCreateGroup`, `useCreateInvite`, `useRevokeInvite`, `useJoinGroup`, `useLeaveGroup`, `useCreateSharedExpense`, `useVoidSharedExpense`, `useCreateSettlement`, `useRecordSettlementReceipt`, `useVoidSettlement`. All mutations invalidate groups, accounts, dashboard and transactions.
- `database.types.ts` updated by hand (new tables, `settlement_id`, RPC signatures).

## Applying it (SQL Editor)

1. Make sure `20261025000000_create_profiles.sql` and `20261026000000_personal_finance.sql` are already applied.
2. Open the Supabase SQL Editor, paste `supabase/migrations/20261027000000_shared_expenses.sql` and run it. It is one `begin; ... commit;`, so a failure rolls back completely.
3. With the Supabase CLI and a local stack: `supabase test db` runs `supabase/tests/shared_expenses_rls.test.sql` (121 assertions) along with the earlier suites. The suite has not been executed yet.

## Pending

- Run the migration and the pgTAP suite against a real stack; fix whatever the first run finds.
- Phase C2: screens (group list, detail, new expense, settle up, invite/join).
- User deletion is blocked (NO ACTION) while a user has group history; needs a product decision (anonymize vs. block).
- No UI to undo a recorded `settlement_in` independently of voiding the settlement; no group archive/rename RPC; no ownership transfer beyond auto-promotion on leave.
- A virtual category (`template:<slug>`) in the dashboard donut has no matching row in `categories`; drill-down by category id from Inicio will find nothing for it.
- Someone who left a group still sees their own shares in the month summary but not the group itself.

## UI (Phase C2)

Status: written locally, not committed, not deployed, never run against Supabase. Only unit/component tests (mocked) were executed.

### Routes

| Path            | Access    | Screen                                                                          |
| --------------- | --------- | ------------------------------------------------------------------------------- |
| `/grupos`       | onboarded | Grupos list or empty state (PNG 10, 11) + "Nuevo grupo" sheet (14) + code sheet |
| `/grupos/:id`   | onboarded | Group detail: balance card and tabs Gastos / Saldos / Miembros                  |
| `/unirse/:code` | onboarded | Invite link: confirmation card, joins only after "Unirme al grupo"              |

Sheets (all `BottomSheet`): Nuevo grupo, Entrar con código, Nuevo gasto compartido, Saldar, Registrar en una cuenta, Detalle de gasto (with void), Invitá a tu gente (code, copy, share). Destructive actions (void expense, void settlement, revoke invite, leave) go through `ConfirmDialog`.

### Structure (`src/features/groups`)

- Containers: `GroupsPage`, `GroupDetailPage`, `JoinGroupPage`, `NewGroupSheet`, `JoinGroupSheet`, `SharedExpenseSheet`, `SettleSheet`, `ReceiptSheet`.
- Presentational: `GroupsScreen`, `GroupDetailScreen`, `ExpensesPanel`, `BalancesPanel`, `MembersPanel`, `ExpenseDetailSheet`, `InviteSheet`, `GroupForm`, `JoinCodeForm`, `SharedExpenseForm`, `SettleForm`.
- Pure domain added: `domain/groupView.ts` (net labels, leave rule, `suggestTransfers` over `simplifyDebts`, void/receipt permissions, own share), `domain/expensePreview.ts` (live split preview with `computeSplit`, equal percentages summing to 100), `cleanCodeInput` in `domain/group.ts`.
- Added to the C1 API layer: `listGroupInvites` / `useGroupInvites` (reads `group_invites`, readable by members through RLS) and `groupKeys.invites`. Active invites are filtered client-side (`isInviteActive`).
- Global FAB: `SharedExpenseSheetProvider` (mounted in `AppShell`) owns the "Nuevo gasto compartido" sheet. `ShellFab` is still the only FAB; on `/grupos/:id` it opens the shared-expense sheet for that group, elsewhere "Nuevo movimiento".
- Login return: `RequireAuth` stores the intended path in `sessionStorage` (`auth/domain/returnTo.ts`) because Google OAuth leaves the SPA; `AuthCallbackPage`, onboarding completion and `RedirectIfOnboarded` go to it; `RequireOnboarded` clears it once inside the app. Only same-origin app paths outside `/auth`, `/bienvenida`, `/onboarding` are accepted.
- Inicio: virtual categories (`template:<slug>`, `template:none`) render from the payload (name, color, icon with `Tag` fallback). Inicio has no per-category links today; `isVirtualCategoryId` (dashboard domain) is the guard to use if a drill-down is added.

### Decisions

- Equal split of 100 / 3 previews 33,34 / 33,33 / 33,33 with the extra cent on the payer, via the same `computeSplit` as the server. Percent mode is prefilled with equal percentages that add up to 100 and re-prefilled when participants change.
- "Pagado desde" only appears when the payer is the person and they have accounts; it is cleared when the payer changes. Same account select for "Saldar".
- Leaving is disabled with an explanation unless the net is exactly 0 (also while balances are unknown).
- "Cómo saldar" comes from `simplifyDebts` over `get_group_balances`; "Saldar" shows only on transfers where the person is the debtor and prefills member and amount. Inconsistent balances yield no suggestions instead of an error.
- Voiding follows server rules: expense creator or payer; settlement debtor or creator; "Registrar en una cuenta" for the receiver on posted settlements (idempotent server side, so offering it again is harmless).
- Left members are hidden from the Miembros tab and pickers but keep their names in old expenses.

### Pending

- Visual pass in a browser against PNGs 10, 11, 14; nothing was screenshot-compared. Detail, expense and settle screens have no PNG.
- Run end to end against a real Supabase project once the migration is applied.
- Share via `navigator.share` and clipboard are untested on real devices.
- No edit of a shared expense (void and re-create), no archive/rename group, no ownership transfer UI.
- Invite codes are only visible in the Miembros tab; there is no QR.

### Visual differences vs PNGs

- Header "+" is a 48px lime button (the PNG shows it next to the global FAB; both exist, only the FAB is global).
- Group cards show the net as label plus amount on two lines; the PNG only has the "Sin gastos todavía" variant.
- "Sin gastos todavía" is shown for a net of 0 only when the group has a single member. `get_my_groups` cannot tell "no expenses" from "settled" (`last_activity` falls back to `created_at`), so multi-member groups at 0 read "Estás al día". A `has_activity` / expense count column would allow the exact label (schema change, not applied).
- Group detail, expense/settle sheets and the join confirmation are composed from existing components (no PNG).
