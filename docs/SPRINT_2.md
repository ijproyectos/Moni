# Sprint 2 — Personal finance data layer (Phase A)

Status: written locally, not committed, not deployed. The migration is **not applied** anywhere. No UI yet (Phase B).

## Schema (`supabase/migrations/20261026000000_personal_finance.sql`)

| Object                       | Purpose                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `category_templates`         | Global read-only onboarding set (15 rows: 11 expense, 4 income) with slug, name, lucide icon, color   |
| `categories`                 | Per-user copies; `kind` expense/income; unique `(owner_id, kind, lower(name))` among non-archived     |
| `accounts`                   | cash/bank/wallet, ARS only, `opening_balance numeric(14,2) >= 0`, `archived_at`                       |
| `transactions`               | `kind` in expense/income/shared_payment/settlement_out/settlement_in; `amount > 0`; posted/voided     |
| `transfers`                  | Between two different own accounts; never income/expense                                              |
| `account_balances` (view)    | `security_invoker`; opening balance + posted movements + posted transfers. Balances are never stored  |
| `complete_onboarding(...)`   | RPC: saves goals, stamps `onboarding_completed_at`, copies templates (idempotent), creates `Efectivo` |
| `get_month_summary(p_month)` | RPC (json): income, expense, balance, available_balance, by_category, daily, recent (5 latest posted of the selected month)               |

Rules enforced in the database:

- Money is `numeric(14,2)`; the client works in integer cents and converts at the repository boundary.
- Nothing financial is deleted: no DELETE grants, FKs to accounts/categories are `ON DELETE NO ACTION`, checked at end of statement so the owner -> `auth.users` cascade still works like `profiles`. Rows are voided (`status = 'voided'`, `voided_at` set by trigger) and voided rows are frozen. Categories and accounts are archived.
- Edits are in-place updates; `updated_at` is maintained by `public.set_updated_at()`. `id`, `owner_id`, `created_at` are protected by trigger and excluded from UPDATE grants.
- Triggers validate that account/category/from/to belong to the row owner, that category kind matches the movement kind, and that nothing is posted to an archived account or archived category. `occurred_on` defaults to the Argentina local date (`America/Argentina/Buenos_Aires`). Trigger functions are not executable by `anon`/`authenticated`.
- Clients may only insert `expense`/`income` transactions (RLS `with check`). The other kinds and `shared_expense_id` (nullable, no FK yet) are reserved for Phase C and excluded from statistics and summaries.
- RLS on every table: `owner_id = (select auth.uid())` for select/insert/update; templates readable by `authenticated`. Column-level grants restrict what clients can write; `anon` has no access.

Error codes surfaced by triggers: `account_not_found`, `category_not_found` (23503); `category_kind_mismatch`, `account_archived`, `category_archived`, `voided_row_is_immutable` (23514). `complete_onboarding` raises `profile_not_found` (P0002) when the profile row is missing; it locks the profile row so concurrent submits create one `Efectivo` account. `src/shared/lib/errors.ts` maps them to Spanish messages.

## Category palette

Brand colors given: Comida `#E5533D`, Súper `#064735`, Transporte `#2F9E8F`, Salidas `#F0AA2A`, Suscripciones `#8A6BD1`, Hogar `#6DBE3A`.
Chosen to sit alongside them: Salud `#E0627A`, Ocio `#4F86D9`, Viajes `#1F9FC4`, Mascotas `#B8864B`, Belleza `#D96BA8`; income: Sueldo `#0E8A6D`, Freelance `#3E7CB1`, Inversiones `#7A6AD8`, Regalos `#E8743B`.

## Client code

Per feature, `src/features/<feature>/{domain,api}`:

| Feature      | Domain (pure, tested)                                                                      | API hooks                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| accounts     | form schema (es-AR amount -> cents), `availableBalance`                                    | `useAccounts`, `useCreateAccount`, `useUpdateAccount`, `useArchiveAccount`                                                                               |
| categories   | form schema, `isCategoryNameTaken`, `categoriesByKind`                                     | `useCategories(kind?, {includeArchived})`, `useCategoryTemplates`, `useCreateCategory`, `useUpdateCategory`, `useArchiveCategory`                        |
| transactions | form/transfer schemas, `filterTransactions`, `groupByDay`, `calendarDayTotals`, `totalsOf` | `useTransactions(filters)`, `useTransfers`, `useCreateTransaction`, `useUpdateTransaction`, `useVoidTransaction`, `useCreateTransfer`, `useVoidTransfer` |
| dashboard    | `parseMonthSummary` (zod, JSON numbers -> cents)                                           | `useMonthSummary(month)`                                                                                                                                 |
| onboarding   | schema, `toggleSlug`, `defaultTemplateSlugs`                                               | `useCompleteOnboarding`                                                                                                                                  |

Shared: `amountInput.ts` (parse/format es-AR input), `month.ts` (ISO-date month helpers), `errors.ts` (`toUserMessage`).

Conventions: query keys include the user id (the cache is not cleared on sign-out); every transaction/transfer mutation invalidates transactions, accounts (balances) and dashboard; free-text search is client-side (`filterTransactions`) over server-filtered rows; a transaction's kind cannot be edited (void and recreate).

## Apply the migration (SQL Editor)

1. Supabase dashboard -> SQL Editor -> New query. Use `moni-dev` first.
2. Confirm the profiles migration (`20261025000000_create_profiles.sql`) is already applied: the new one needs `public.set_updated_at()` and `public.profiles`.
3. Paste the whole contents of `supabase/migrations/20261026000000_personal_finance.sql` and run it once (it is not idempotent; it is wrapped in `begin; ... commit;` so a failure rolls back completely).
4. Check Table Editor shows `categories`, `accounts`, `transactions`, `transfers`, `category_templates` with RLS enabled and 15 template rows.
5. With the CLI available later: `supabase db push`, and `supabase test db` runs `supabase/tests/*.test.sql`.

## Tests

- Vitest: domain and shared helpers (all green).
- pgTAP `supabase/tests/personal_finance_rls.test.sql` (36 assertions; fixtures are inserted without `id` and located by `note`, since clients cannot insert `id`) written but **not run**: no Docker/Supabase CLI was available.

## Pending

- Run the SQL and the pgTAP suite against a real Postgres; fix anything they surface.
- Phase B: screens (onboarding, accounts, new movement, activity, calendar, dashboard).
- Phase C: shared expenses; adds the FK on `transactions.shared_expense_id` and the creation path for reserved kinds.
- Regenerate `database.types.ts` with `supabase gen types` once the CLI is linked (currently hand-written).
- Search by note is client-side; move server-side if lists grow beyond PostgREST's 1000-row page.
