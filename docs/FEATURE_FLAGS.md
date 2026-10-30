# Feature flags

All flags live in `src/shared/config/features.ts` and ship as `false`. They cover screens that were built on
simulated, in-memory data and have no real backend yet. With a flag off, its entry points are hidden and its
routes (see `src/app/router.tsx`, `FeatureGate`) redirect to the home route. The mock stores also start empty:
nothing the person did not enter reaches the screen.

Turn a flag on only after the backend in the right column exists and the mock store is replaced by it.

| Flag                            | What it controls                                                                                        | Backend needed first                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `notifications`                 | Home bell + "Avisos" badge, `/avisos`                                                                   | Notifications table or push service; per-user unread state                                                  |
| `debts`                         | `/deudas`, debts summary link in Grupos, reminders                                                      | Persisted settlements/debts across users and scheduled reminders                                            |
| `aguinaldo`                     | `/aguinaldo*`, entry points in Metas, Más and trip groups                                               | Table for the plan (amount, pay date, destinations) tied to real goals/cards                                |
| `pro`                           | `/pro`, Pro cards, onboarding paywall step 6, "Integraciones"                                           | Billing provider, entitlements, real trial; bank/wallet integrations                                        |
| `referral`                      | `/recomendar`, "2 meses de Pro" copy                                                                    | Referral codes, attribution on sign-up, reward granting (needs `pro`)                                       |
| `sharedGoals`                   | Shared goals tab and sheet in Metas                                                                     | Shared goals with members, contributions and permissions                                                    |
| `weeklyDigest`                  | `/hormigas/aviso-semanal`, profile "Resumen semanal" row                                                | Scheduler + delivery channel (push/email) and persisted preferences                                         |
| `accountAlias`                  | Alias fields and "Cargar alias" in Medios de pago                                                       | Alias column on accounts (and its use by group summaries)                                                   |
| `monthlyIncome`                 | Profile "Mis ingresos"                                                                                  | Persisted income on the profile (also needed for split by income)                                           |
| `groupGuestsAndSimulatedSplits` | People without Moni, split by amount / by income, several payers, settlements recorded for someone else | Guest members, multi-payer expenses, amount splits and settlements recorded by either party in the database |

## Groups: what is real

With `groupGuestsAndSimulatedSplits` off, balances, "Para quedar a mano" and "Saldar" use only server data
(members, expenses, settlements). Only the payer can register a settlement. `ledger.ts`, `useGroupLedger` and the
overlay types stay because the flag-on path and `ledger.test.ts` use them.

## Account brands ("Agregar rápido")

The catalog in `src/features/accounts/domain/bankCatalog.ts` is static. There is no brand column in the database
(no migration), so the list derives an account's brand by exact normalized match of its name to a catalog entry
("Galicia" or "galicia" match; "Galicia sueldo" does not). Persist the catalog id with the account in a later
version. Logo sources and the pending official assets are in `src/assets/brands/ATTRIBUTION.md`.
