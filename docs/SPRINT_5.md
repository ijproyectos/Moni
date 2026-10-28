# Sprint 5 — Gastos hormiga, informes y presupuestos (Phase D1)

Status: written locally, not committed, not deployed. Nothing was run against Supabase: neither the migration nor its pgTAP suite has executed.

Features 4, 5 and 6 now use real data. The visual baseline is the v0.2.0 redesign: screens keep their look and copy, only the data source changed.

## What changed

| Feature                | Screen                                              | Source of data                                                                  |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| 4. Gastos hormiga      | `/hormigas` (AntsPage), Inicio shortcut             | RPC `get_ant_expenses`                                                          |
| 5. Informes            | `/hormigas/aviso-semanal` (WeeklyDigest) | RPC `get_period_summary` (current week vs previous week)                        |
| 5. Informes            | `/este-mes`, `/tu-anio`                             | Unchanged (already real, `get_month_summary`)                                   |
| 6. Presupuestos        | Categorías (limit field, badge, "Sugerencias"), Inicio card "Ojo con tus límites" | table `budgets`, RPCs `get_budget_status`, `suggest_budgets` |
| 6. ¿Conviene en cuotas? | `/metas/cuotas`                                    | Pure TypeScript (`features/budgets/domain/installments.ts`), no database       |

Removed mocks: `features/budgets/mock/budgetsStore.ts` and `features/insights/mock/antsData.ts`. The weekly-digest preferences (toggle, day, time, small limit) that the profile screen edits were split into `features/insights/mock/digestSettings.ts`; they stay simulated because scheduling and push are out of scope. Not touched: metas, aguinaldo, viajes, deudas, avisos, Pro, groups overlay, fijos.

## SQL rules (`supabase/migrations/20261028000000_insights_budgets.sql`)

Same conventions as the earlier reviewed migrations: one `begin; ... commit;`, `numeric(14,2)`, RLS, column-level grants, no DELETE grant (budgets are archived), `set_updated_at` and `protect_owned_columns` triggers, NO ACTION foreign keys, every function `set search_path = ''` and `security invoker`, RPCs revoked from `public, anon` and granted to `authenticated`, trigger function revoked from everyone. `get_month_summary` is not modified.

### Shared inclusion rules: `personal_movements(from, to)`

An invoker helper that returns the caller's income/expense rows of `[from, to)` with exactly the `get_month_summary` rules: posted `expense`/`income` transactions, plus the caller's own posted share of shared expenses as an expense (under their own non-archived category named like the template, else virtual `template:<slug>`; `template:none` / "Gastos compartidos" without template). Shared payments and settlements never count. `get_period_summary`, `get_budget_status` and `suggest_budgets` are built on it. It is executable by `authenticated` (RLS and `auth.uid()` still scope it, `my_shared_shares` is the only definer piece), not by `anon`.

### `budgets`

`id, owner_id, category_id, amount, archived_at, created_at, updated_at`. `amount > 0`. Unique index: one active budget per `(owner_id, category_id)`. A trigger requires the category to be the owner's own, not archived, and `kind = 'expense'` (`category_not_found` 23503, `category_archived` / `category_kind_mismatch` 23514); it also runs when an archived budget is restored. Clients can insert only `(category_id, amount)`, update only `(amount, archived_at)`, and have no DELETE.

### `get_period_summary(p_from, p_to)`

`p_from` inclusive, `p_to` exclusive, at most 400 days, otherwise `invalid_period` (22023). Returns `income, expense, balance, by_category, daily` with the same shape, ordering and rounding as `get_month_summary`, so a full month gives identical `by_category`, `daily` and totals (the pgTAP suite asserts the equality).

Example (user A, October 2026): cafés 9.000 + súper 3.000 + subte 1.000 + 8 big purchases of 50.000 = 413.000 of own transactions, plus A's share of a 3.001,00 dinner split in two (1.500,50) = **414.500,50** of expense. `('2026-09-30', '2026-11-01')` also counts 30/09 (inclusive) and not 01/11 (exclusive): 3.000 + 414.500,50 = 417.500,50.

### `get_ant_expenses(p_month, p_max_amount = null)`

- Population: the caller's own posted expense transactions of the month. Shares of shared expenses are **not** ants (they are not the caller's own purchases).
- Threshold (the "ant" ceiling): `p_max_amount` if given (must be > 0, else `invalid_amount`), otherwise **the lesser of $10.000 and the median expense transaction of that month** (no expenses: $10.000). The threshold is returned so the UI can say "Gastos de hasta $X".
- Group key: category + `lower(btrim(note))`; an empty note falls back to the category name. A group qualifies with **3 or more** occurrences. Label = key with its first letter capitalized.
- Returns `month, threshold, month_total, share_of_expenses, groups[]` with `category_id, category_name, color, icon, label, count, total, average, yearly_projection (total x 12)`, ordered by total desc. `share_of_expenses` = `month_total` / the month's expense total as `get_month_summary` shows it (shares included, so it reconciles with Inicio), rounded to one decimal, `null` without expenses.

Example (user A, October): notes `Cafe `, `cafe`, `CAFE` (3.000 each) normalize to one key: count 3, total 9.000, average 3.000, yearly 108.000. Three unnamed 1.000 purchases in Súper form a second group (3.000). Two 500 "Subte" rides do not qualify. The 8 purchases of 50.000 push the median to 26.500, so the threshold is the 10.000 cap. `month_total` = 12.000; `share_of_expenses` = 12.000 / 414.500,50 = 2,9%. A user whose median is 200 gets a threshold of 200.

### `get_budget_status(p_month)`

For each active budget of a non-archived category: `budget_id, category_id, name, color, icon, amount, spent, remaining, percent, state`. `spent` follows the expense rules above (shares included). `percent = round(spent x 100 / amount, 1)`. State uses the exact amounts: **over** when `spent > amount`, **warning** when `spent >= 80%` up to and including 100%, otherwise **ok**. Ordered by usage desc.

Example: Comida limit 10.000, cafés 9.000 + own share 1.500,50 = 10.500,50 spent, remaining -500,50, 105,0%, `over`. Súper limit 500.000, spent 403.000: 80,6%, `warning`. A 1.000 limit with 800 spent is `warning` (exactly 80%), with 1.000 spent still `warning` (exactly 100%), with 1.000,01 `over`.

### `suggest_budgets()`

For non-archived expense categories **without** an active budget: sum of spend in the last 3 complete months (Argentina calendar, current month excluded), divided by 3 (months without spend count as zero), rounded **up** to the next $1.000. Only when at least 2 of those 3 months have spend. Returns `category_id, name, color, icon, suggested_amount, months_with_data`, biggest spend first.

Example: spend of 1.500, 2.000 and 1.000 in the last three months: 4.500 / 3 = 1.500 -> **2.000**, 3 months. A category with 100 and 150 in two of the three months: 250 / 3 = 83,3 -> **1.000**, 2 months. Spend in only one complete month: no suggestion.

### Errors

`invalid_period`, `invalid_amount`, `category_not_found`, `category_archived`, `category_kind_mismatch`, and the unique index name `budgets_owner_category_active_key` (a second active limit for a category) are mapped to Spanish messages in `src/shared/lib/errors.ts`.

## ¿Conviene en cuotas? (`installments.ts`)

Inputs: cash price, number of installments (1-120), installment amount or total financed, expected monthly inflation % (the screen starts at 3% and lets the user edit it), optional cash discount %. Model: installments paid at the end of each month, discounted at the inflation rate.

- `cashPay = price x (1 - discount)`, `presentValue = sum of installment / (1 + inflation)^k`.
- `effectiveCost = presentValue - cashPay`; verdict: `similar` when within +/-2% of `cashPay`, `cuotas` below, `contado` above.
- Implied monthly rate (CFT-like): the rate that makes the installments equal `cashPay`, solved by bisection over [-95%, 1000%] per month.
- Explanations are Spanish (rioplatense) sentences with amounts formatted as ARS.

Example: price 100.000, 12 x 10.000, 0% inflation -> present value 120.000, `contado` (+20%), implied rate 2,9% per month. At 5% inflation the present value is about 88.600 and the verdict is `cuotas`. A 20% cash discount (cash 80.000) flips it back to `contado`.

## Client

- `features/insights`: `domain/ants.ts` (parse, group deltas, tip), `domain/weekly.ts` (Monday-Sunday weeks, week-over-week change), `api/useAnts.ts`, `ui/AntsPage.tsx` (this month / last month, change against the previous month), `ui/WeeklyDigestPage.tsx` (current week vs previous week, top 3 categories, link to ants). Weeks use `argentinaTodayIso()` so the Argentina calendar day is used regardless of the device timezone. There is no scheduling or push yet.
- `features/dashboard`: `domain/periodSummary.ts`, `usePeriodSummary(from, to)`.
- `features/budgets`: `domain/budget.ts`, `domain/installments.ts`, `api/useBudgets.ts` (`useBudgetStatus`, `useBudgetSuggestions`, `useCreateBudget`, `useUpdateBudget`, `useArchiveBudget`), `ui/BudgetAlertsCard.tsx` (Inicio), `ui/BudgetBadge.tsx` (category list), `ui/BudgetSuggestions.tsx` ("Usar sugerencia").
- Query keys are user-scoped and sit under `['dashboard', userId, ...]` (ants, period summary, budget status and suggestions). Every transaction, account, category and group mutation already invalidates `dashboardKeys.all`, so all of them refresh without new wiring; a test guards the prefix. Budget mutations invalidate the same prefix.
- Budget alerts are UI only: the Inicio card and the badge on the categories screen. No push.
- `database.types.ts` updated by hand (`budgets` table, four RPCs).

## Apply the migration (SQL Editor)

1. Supabase dashboard -> SQL Editor -> New query. Use `moni-dev` first.
2. The three earlier migrations must already be applied (`20261025`, `20261026`, `20261027`): this one needs `set_updated_at`, `protect_owned_columns`, `categories`, `transactions`, `category_templates`, `my_shared_shares` and `get_month_summary`.
3. **Reopen `supabase/migrations/20261028000000_insights_budgets.sql` fresh from disk** (do not paste from an old editor tab or chat), select all, paste, and run it once. It is not idempotent and is wrapped in `begin; ... commit;`, so a failure rolls back completely.
4. Check Table Editor shows `budgets` with RLS enabled, and that `select public.suggest_budgets();` runs for a signed-in user.
5. With the CLI available later: `supabase db push`, and `supabase test db` runs `supabase/tests/insights_budgets_rls.test.sql` (79 assertions).

## Tests

- Vitest: installments (35 cases: 0% inflation, 1 installment, discount, +/-2% boundary, bisection, validation), budget and ants parsing, weekly ranges, period summary parsing, query-key prefixes, AntsPage states, Inicio budget card and ants shortcut, error messages.
- pgTAP (`supabase/tests/insights_budgets_rls.test.sql`, not executed): RLS isolation, column grants, no delete, category validation, unique active budget and archive/restore, status thresholds (80%, 100%, over), month scoping, shares included, voided/income excluded, period equality with `get_month_summary`, inclusive/exclusive bounds and the 400-day limit, ants normalization/threshold/median/override, suggestions window and exclusions, anon denied on every RPC.

## Pending

- Run the migration and the pgTAP suite against a real database (nothing was executed).
- Weekly digest scheduling and push (the profile toggles are still simulated).
- Ants are not computed per week anymore (the old mock had a week toggle); the RPC is monthly. A weekly ants view would need a period variant of `get_ant_expenses`.
- `personal_movements` is callable by any signed-in user (it only returns their own rows); revisit if a stricter internal-only helper is wanted.
- Budgets are month-agnostic (same limit every month); per-month overrides are not modeled.
