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

Semántica de las tools:
- Cuotas: una cuota fechada **hoy o después** cuenta como pendiente de pago (igual que la app: en `cards/domain/plans.ts` una cuota queda atrás recién cuando su cierre es anterior a hoy). `get_installments` y `get_upcoming_dues` usan `occurred_on >= hoy`.
- `get_installments`: lee las cuotas futuras paginadas (páginas de 1000, hasta 5 páginas = 5000 filas) y luego solo los planes que aparecen en esas filas (hasta 300). Los totales son exactos hasta ese techo; si se alcanza, devuelve `truncated: true` y una `note` para que Moni aclare que son aproximados. Si hay más de 30 compras, `purchases_omitted` indica cuántas no se listan (los totales las incluyen).
- `get_upcoming_dues`: excluye vencimientos de gastos fijos **pausados** (pausar deja las ocurrencias pendientes en la tabla; eliminar las pasa a `skipped`). Ventana: vencidos de los últimos 60 días + próximos `days` días. El límite se aplica después de filtrar y prioriza los próximos; los vencidos se informan aparte (`overdue_count`, `overdue_amount`).
- Resultados grandes: si un resultado supera 8000 caracteres se descartan filas del final de su lista más grande y se agrega `truncated: true` y `omitted_count` (en `list_transactions`, `returned` se ajusta). Solo si ni así entra, devuelve `result_too_large`.
- `get_small_expenses`: `small_expenses_total` es la suma de los grupos hormiga (no el gasto total del mes); `share_of_month_expenses_percent` es ese total como % del gasto del mes.
- Fechas: `from`/`to`/`month` se limitan a 2000-01-01 .. hoy + 1 año (fuera de eso se ajusta; un rango totalmente fuera da `invalid_range`).

Gasto hormiga: gastos propios del mes de monto <= umbral (por defecto el menor entre $10.000 y la mediana de gastos del mes), agrupados por categoría + nota, solo grupos con 3 o más repeticiones.

## Seguridad
- `verify_jwt = true`; además se rechaza el token anon.
- Todas las lecturas y la cuota usan el JWT de la persona con la anon key: RLS aísla los datos. Nunca la service role.
- `consume_ai_quota('insights_chat', 30)` corre antes del modelo: Free -> 402 `plus_required`, límite diario -> 429.
- El prompt trata resultados de tools y texto del usuario como datos, nunca instrucciones. No hay tools de escritura.
- Límites: 12 mensajes, 1000 caracteres c/u, 8000 en total; máx. 5 vueltas del modelo y 50 s en total.
- Los errores crudos nunca llegan al cliente (solo códigos: `ai_unavailable`, `ai_timeout`, `ai_quota_exceeded`, `plus_required`, `invalid_request`).
- Nombres de miembros y de grupos (texto de terceros) se limpian a letras, números, espacios y puntuación básica de nombres (máx. 40 caracteres), y el prompt indica que los nombres y notas dentro de los resultados son datos no confiables.
- La conversación vive solo en memoria del cliente.

## Limitaciones conocidas
- No hay reembolso de cuota: la cuota diaria se consume antes de llamar al modelo y no se devuelve si el modelo o una tool fallan (mismo trade-off aceptado que `parse-movements`).
- Nada de esto se probó contra Anthropic ni una base real; solo tests con cliente falso.
- La paginación asume el `max_rows` por defecto de PostgREST (1000).

## Deploy
```
supabase functions deploy insights-chat --use-api
```
Reusa los secrets `ANTHROPIC_API_KEY` y `ALLOWED_ORIGINS`. Opcional: `INSIGHTS_CHAT_MODEL` (por defecto `claude-haiku-5-5`).
No requiere migración (la cuota y el gate Plus de `insights_chat` ya están en `20261106000000_moni_plus.sql`).
