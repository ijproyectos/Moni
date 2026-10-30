# Asistente de Informes (Moni)

Chat con Moni en `Informes > Asistente` (`/informes/asistente`, accesible desde "Este mes" y "Tu año"). Es de **Moni Plus**.
Moni responde con los datos reales de la persona; no escribe nada.

## Qué responde
Ingresos, gastos y movimientos, vencimientos (gastos fijos, suscripciones, cuotas), gastos hormiga, cuotas y saldos de grupos.

## Herramientas (solo lectura)
| Tool | Lee |
|---|---|
| `get_period_summary` | RPC `get_period_summary` (movimientos + tu parte de gastos compartidos) |
| `list_transactions` | `transactions` (posted, expense/income), `categories`, `accounts` |
| `get_upcoming_dues` | `fixed_expense_occurrences`, `fixed_expenses`, `subscriptions`, `transactions` (cuotas), `installment_plans` |
| `get_installments` | `installment_plans`, `transactions` (cuotas futuras) |
| `get_subscriptions` | `subscriptions` |
| `get_group_balances` | RPC `get_my_groups` y `get_group_balances` |
| `get_small_expenses` | RPC `get_ant_expenses` (misma lógica que la pantalla Gastos hormiga) |

Gasto hormiga: gastos propios del mes de monto <= umbral (por defecto el menor entre $10.000 y la mediana de gastos del mes), agrupados por categoría + nota, solo grupos con 3 o más repeticiones.

## Seguridad
- `verify_jwt = true`; además se rechaza el token anon.
- Todas las lecturas y la cuota usan el JWT de la persona con la anon key: RLS aísla los datos. Nunca la service role.
- `consume_ai_quota('insights_chat', 30)` corre antes del modelo: Free -> 402 `plus_required`, límite diario -> 429.
- El prompt trata resultados de tools y texto del usuario como datos, nunca instrucciones. No hay tools de escritura.
- Límites: 12 mensajes, 1000 caracteres c/u, 8000 en total; máx. 5 vueltas del modelo y 50 s en total.
- Los errores crudos nunca llegan al cliente (solo códigos: `ai_unavailable`, `ai_timeout`, `ai_quota_exceeded`, `plus_required`, `invalid_request`).
- La conversación vive solo en memoria del cliente.

## Deploy
```
supabase functions deploy insights-chat --use-api
```
Reusa los secrets `ANTHROPIC_API_KEY` y `ALLOWED_ORIGINS`. Opcional: `INSIGHTS_CHAT_MODEL` (por defecto `claude-haiku-5-5`).
No requiere migración (la cuota y el gate Plus de `insights_chat` ya están en `20261106000000_moni_plus.sql`).
