# Pagos de deudas con cuentas: cómo probar la migración (sin tocar producción)

Migración: `supabase/migrations/20261122000000_payment_reports_accounts.sql`
Rollback: `supabase/ops/payment_reports_accounts_rollback.sql`
Pruebas SQL: `supabase/tests/payment_reports_accounts.test.sql` (pgTAP, 34 aserciones: pago parcial, cobro, rechazo,
cancelación, confirmación duplicada, aviso sin cuenta, deuda saldada por otro lado, RLS y estadísticas).

## Reglas
- «Ya pagué» con cuenta descuenta ya (egreso ligado al aviso); la deuda sigue abierta.
- «Confirmar recepción» exige cuenta y acredita; el egreso del pagador se liga al settlement (misma fila).
- Rechazo / cancelación / deuda ya saldada: el egreso se anula y el saldo vuelve.
- Pagos y cobros mueven saldos y aparecen en Movimientos; los resúmenes solo cuentan `expense` / `income`.

## Avisos anteriores a la migración (sin duplicar descuentos)
Un aviso abierto de antes no tiene egreso (no hay backfill, a propósito): si el pagador ya transfirió, su cuenta no
se descontó y la migración no lo inventa. Al confirmar solo se acredita al receptor; el pagador no se descuenta dos
veces porque no hay fila para ligar. Los avisos ya confirmados o cerrados no se tocan. Si querés descontarle a quien ya
transfirió, que registre el pago a mano o que cancele el aviso y avise de nuevo eligiendo cuenta.
Antes de aplicar, mirar cuántos hay: `select count(*) from public.payment_reports where status = 'reported';`

## Probar en un entorno separado
**Opción A, local (recomendada):** necesita Docker y el CLI de Supabase.
1. `supabase start` y `supabase db reset` (aplica todas las migraciones, incluida la nueva, sobre una base vacía).
2. `supabase test db` ejecuta todos los `*.test.sql`; el nuevo debe dar 34/34 y los anteriores seguir verdes.
3. Probar el rollback: `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2 | tr -d '"')" -1 -f supabase/ops/payment_reports_accounts_rollback.sql`,
   luego `supabase test db` (los tests de pagos fallan a propósito, el resto sigue verde) y volver a aplicar la migración.

**Opción B, proyecto aparte en Supabase** (un proyecto de prueba, nunca el real):
1. Aplicar todas las migraciones en orden y la nueva al final (SQL Editor, una por una, o `supabase db push --linked`).
2. Apuntar la app a ese proyecto con otro `.env.local` (`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` del proyecto de prueba).
3. Crear dos usuarios de prueba (dos navegadores o uno normal y uno privado), un grupo, una cuenta cada uno y un gasto grupal.
4. Recorrido manual: pagar con cuenta (el saldo baja ya) → confirmar con otra cuenta (sube) → repetir con rechazo y
   cancelación (el saldo vuelve) → confirmar dos veces (la segunda falla sin mover nada) → comparar Inicio, Cuentas y
   Movimientos en ambos usuarios → verificar que los totales de ingresos y gastos del mes no cambian.

## Antes de producción
Respaldo, aplicar la migración (una transacción), y recién después publicar la app: la app nueva envía la cuenta y
falla con la función vieja. Verificación posterior:
`select proname, pronargs from pg_proc where proname in ('report_payment','confirm_payment_report');` debe dar 4 y 2.
