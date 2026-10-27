# Sprint 3 — Personal finance UI (Phase B)

Status: written locally, not committed, not deployed. No Supabase calls were made; the Sprint 2 migration is still not applied anywhere, so none of these screens has run against a real backend.

## Routes

| Path                                 | Access                       | Screen                                                                               |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------ |
| `/onboarding`                        | authenticated, not onboarded | Goals -> benefits -> currency -> categories (PNG 02-05), one route, local step state |
| `/`                                  | onboarded                    | Inicio (08, 15)                                                                      |
| `/actividad`                         | onboarded                    | Actividad (09)                                                                       |
| `/grupos`                            | onboarded                    | Placeholder with mascot, no data (Phase C)                                           |
| `/mas`                               | onboarded                    | Más (12): profile card + Medios de pago, Categorías, Grupos                          |
| `/cuentas`, `/categorias`, `/perfil` | onboarded                    | Second-level pages (no PNG), composed from the shared vocabulary                     |

`RequireOnboarded` redirects to `/onboarding` while `profile.onboarding_completed_at` is null; `RedirectIfOnboarded` keeps finished users out of the flow. "Nuevo movimiento" (13) is a bottom sheet opened by the FAB from any tab (`MovementSheetProvider` in `AppShell`).

## Shared UI (`src/shared/ui`)

BottomSheet (portal, focus trap, Esc/scrim/X, scroll lock, focus restore), ConfirmDialog (built on BottomSheet), SegmentedControl, CategoryChip, MovementRow (also used for accounts and categories), AmountDisplay + `HiddenAmountsProvider`/`hiddenAmountsContext`, AmountInput, Card, EmptyState, Toast (`ToastProvider`, `useToast`, optional mascot), Skeleton, ProgressHeader, IconCircle / CategoryIconCircle, MonthPicker, PageHeader, `categoryIcons` (curated lucide set, brand color palette, tint/contrast helpers).

Container/presentational split: pages (`HomePage`, `ActivityPage`, `OnboardingPage`, `AccountsPage`, `CategoriesPage`, `ProfilePage`) fetch and mutate; `HomeScreen`, `ActivityScreen`, `TransactionForm`, `TransferForm`, `AccountForm`, `CategoryForm`, the onboarding steps and `CategoryDonut` receive props.

New pure domain code: `onboarding/domain/goals`, `dashboard/domain/{insight,donut}`, `transactions/domain/activity` (merges transactions and transfers, filters, day groups), `auth/domain/profile`; `shared/lib/dates`, `formatCompact` in `money.ts`.

## Decisions

- Out-of-scope items are hidden, not teased: Pro, voice, notifications, integrations, budgets, fixed/installments, tags, charts tile, "Primeros pasos" banner, USD toggle, "Mejor lo digo con la voz", "PLAN GRATIS". Onboarding screens 06 and 07 are not built.
- Only ARS. Amounts are integer cents, formatted es-AR through `formatArs`. Hidden amounts: one provider, persisted in `localStorage` inside try/catch; every amount goes through `AmountDisplay`.
- Delete means void (always behind a confirm dialog); edit is in place; the kind of a movement is locked in edit mode.
- Transfers are a third tab of the same sheet (Gasto / Ingreso / Transferencia). In Actividad they show an arrow icon, "Origen -> Destino", are not counted in totals or day nets, can be voided, and are hidden when filtering by kind or category. They cannot be edited (no update path).
- Inicio shows "Disponible en cuentas" (available balance) as one small line under the pill bar. The month dropdown lists the last 12 months.
- Actividad: calendar totals and GASTASTE/INGRESASTE are for the whole month (not affected by search/filters); the list reacts to search, kind, category chip and selected day. The count in the title is the number of listed rows.
- Missing designs (Cuentas, Categorías, Perfil, onboarding slides 2-3, edit sheet, transfer sheet) reuse cards, chips, pill buttons, sheets, segmented control and rows only.
- Fix to a Phase A helper: `formatArs` dropped the trailing zero (`$12.345,5`). It now shows two decimals whenever there are cents (`$12.345,50`) and none for whole amounts, matching the designs; its test was updated.

## Tests added

Onboarding gate redirect (`auth/ui/onboardingGate.test.tsx`), onboarding category count and completion payload, `TransactionForm` validation and cents payload, hidden amounts masking and persistence, `HomeScreen` empty data (insight and empty state) and real data (insight, donut), `ActivityPage` search / kind filter / void confirm and cancel, `buildActivity`, goals, insight and donut math, `formatCompact`.

## Pending

- Apply the Sprint 2 migration and run everything against a real project (including the pgTAP suite).
- Visual pass in a browser against the PNGs; nothing was screenshot-compared.
- Edit of transfers; restoring voided movements; per-account filter in Actividad.
- The main JS chunk is over 500 kB (inlined mascot SVGs); consider lazy routes and external assets.

## Known visual differences vs PNGs

- Onboarding benefits carousel has 3 slides (MVP only) instead of 4 dots; slide copy for groups and money loading is new, slide 1 drops "contra el mes pasado".
- Currency step: flag is a small inline SVG, selector is disabled, no dollar checkbox.
- Categories step: no "+ Crear" chip and all templates start selected (PNG shows 9 of 15).
- Inicio: mascot circle uses `expresion_feliz`; pill widths are proportional with a minimum share; extra "Disponible en cuentas" line; donut slices are drawn from all categories, legend shows the top 4.
- Nuevo movimiento: adds Transferencia segment, account select, date input and a "Nueva categoría" chip; no voice link; selected expense chip uses the category color instead of a darker red.
- Más: tiles are only the three in scope (grid of 2 with a lone third tile); subtitle of Medios de pago drops "Tarjetas".
- Actividad: category chip row and trash/edit behaviours added; calendar days after today are dimmed only when empty.
