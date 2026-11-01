# Panel de administración de Moni (`/adminmoni`)

Panel de solo lectura para ver rápido qué pasa: usuarios, suscripciones Plus, uso de IA, salud de la sincronización con Mercado Pago y estado del sistema. Una única acción: mandar un aviso push a un usuario.

Piezas: ruta `/adminmoni` de la SPA (código en un chunk aparte), Edge Function `admin-panel`, migración `20261114000000_admin_panel.sql` (funciones `admin_*` y tablas `admin_accesos` y `admin_acciones`).

## Cómo funciona el acceso

La SPA no puede hacer cumplir la seguridad: todo dato sale de la Edge Function `admin-panel`, que:

1. Toma al usuario del JWT con `auth.getUser()` (nunca `getSession`, nunca el cuerpo del pedido).
2. Exige email confirmado (`email_confirmed_at`) o una identidad de Google con email verificado que coincida con el de la cuenta.
3. Exige que el email esté en el secret `ADMIN_EMAILS` (separado por comas; se recortan espacios y se pasa a minúsculas). Vacío o sin definir significa que nadie es admin; nunca devuelve un 500 por eso.
4. Recién después crea el cliente `service_role`. Si algo falla: 403 sin datos.

Las funciones SQL son `SECURITY DEFINER` con `search_path = ''`, y `EXECUTE` es solo de `service_role` (no de `public`, `anon` ni `authenticated`). Aunque alguien llame a `/rest/v1/rpc/admin_*` con su sesión, recibe `permission denied`.

Pantallas de la SPA en `/adminmoni`:

- Sin sesión: «Entrar con Google» (vuelve a `/adminmoni`).
- Con sesión pero 403: muestra el email y el motivo («Cuenta no habilitada» / «Email sin confirmar») y el botón «Entrar con otra cuenta de Google» (cierra sesión local y abre el selector de cuentas).
- Admin: el panel, con botón «Salir».
- A los 30 minutos sin actividad (mouse, teclado, volver a la pestaña) se cierra la sesión y vuelve al ingreso con el aviso «Cerramos la sesión por inactividad». El último momento de actividad se guarda en el navegador: cerrar la pestaña y volver pasados 30 minutos también cierra.

Netlify sirve `/adminmoni/*` con la misma `index.html` y agrega `X-Robots-Tag: noindex` y `Cache-Control: no-store`.

## Secrets

| Dónde               | Nombre                  | Valor                                                                           |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| Secrets de Supabase | `ADMIN_EMAILS`          | `jonatan.rios.jr@gmail.com,srurmica@gmail.com,iaritasrur@gmail.com` (confirmar) |
| Secrets de Supabase | `VAPID_*` (ya cargados) | los mismos de [PUSH.md](PUSH.md), los usa el aviso push                         |

```sh
supabase secrets set ADMIN_EMAILS="jonatan.rios.jr@gmail.com,srurmica@gmail.com,iaritasrur@gmail.com" --project-ref ovgzwbhfvyjwpqhyilpq
```

Para cambiar quién es admin se vuelve a correr ese comando con la lista nueva (no hace falta redeploy de la función, pero puede tardar unos segundos en tomarlo).

## Cómo aplicarlo (siempre con respaldo previo y autorización)

1. Respaldo de la base.
2. Prueba en seco (ver abajo), contra una copia o una transacción que se revierte.
3. Aplicar la migración con el procedimiento del repo (`supabase db push --linked`, o `psql -1 -f supabase/migrations/20261114000000_admin_panel.sql` y registrar la versión en `supabase_migrations.schema_migrations`).
4. `supabase functions deploy admin-panel --project-ref ovgzwbhfvyjwpqhyilpq` (`verify_jwt = true` ya está en `supabase/config.toml`).
5. Mergear `feat/admin-panel` a `main` para que Netlify publique la SPA.

La migración es idempotente (`create or replace` / `if not exists`) y va en una sola transacción.

## Qué se ve y qué no

- Resumen: usuarios, altas 7/30 días, activos hoy/7/30 días, Plus, Mercado Pago vinculado, llamadas de IA y alertas (sincronizaciones con error, pagos que no se pudieron importar, suscripciones Plus autorizadas sin pago, fallas de cron en 24 h).
- Usuarios: búsqueda por email, filtros (todos, Plus, inactivos +7, +30, con Mercado Pago), paginado. Detalle con actividad diaria, Plus, pagos, vínculo de Mercado Pago y el aviso push.
- Plus: activos, vencidos, suscripciones por estado, ingresos de 30 días (ARS), últimos pagos y «autorizadas sin pago».
- IA y costos: llamadas por día y por función. **El costo (USD) figura como «sin datos»**: `ai_usage` guarda una fila por llamada (quién, función, cuándo) pero no el modelo, los tokens ni el costo.
- Mercado Pago: vinculaciones por estado, resultado de la última sincronización, errores por tipo, cuentas con problemas, importaciones y tarea `moni-mp-sync`.
- Sistema: tareas de `pg_cron` y sus fallas, respuestas de `pg_net` en 24 h, tamaño de la base, última migración, almacenamiento y avisos push. Si `pg_cron`, `pg_net` o `storage` no existen o no se pueden leer, la sección dice «sin datos».

Limitaciones conocidas: Moni no registra pagos Plus «no acreditados» como evento; la lista «autorizadas sin pago» es una aproximación. La actividad no distingue los movimientos que generan solos las suscripciones o gastos fijos de los cargados a mano (sí excluye lo importado desde Mercado Pago y la categorización automática de IA).

## Garantías de privacidad

- Nunca se devuelve ni se muestra texto escrito por las personas: notas, contenido de comprobantes, chat o insights, comercios, nombres de grupos. Solo datos de cuenta, cantidades, fechas, montos y estado del sistema.
- No se devuelven tokens, claves ni `external_reference` de suscripciones.
- `admin_accesos` registra una fila por pedido al panel (email del admin, sección, hora). `admin_acciones` registra cada aviso push (email del admin, usuario destino, hora, cantidades enviadas); **nunca el título ni el mensaje**. Ambas tienen RLS sin políticas: solo `service_role`.
- El aviso push está limitado a 10 por hora por admin.

Frase propuesta para la política de privacidad (la app todavía no tiene una página de política): «El equipo de Moni puede ver métricas de tu cuenta y de uso (no el contenido de tus movimientos ni de tus conversaciones) para operar y dar soporte al servicio.»

## Prueba en seco

Ejecuta cada función como `service_role` dentro de una transacción que se revierte y comprueba que `authenticated` y `anon` son rechazados. Con `psql` (usa `\gset`):

```sql
begin;

-- Un usuario real para probar el detalle (se lee antes de cambiar de rol).
select coalesce((select id from auth.users limit 1), gen_random_uuid()) as uid \gset

set local role service_role;
select jsonb_pretty(public.admin_resumen());
select * from public.admin_usuarios(null, 'todos', 5, 0);
select * from public.admin_usuarios('gmail', 'plus', 5, 0);
select jsonb_pretty(public.admin_usuario(:'uid'));
select jsonb_pretty(public.admin_plus());
select jsonb_pretty(public.admin_ia());
select jsonb_pretty(public.admin_mp());
select jsonb_pretty(public.admin_sistema());

-- authenticated y anon no pueden ejecutar nada (cada bloque falla si lo logran).
reset role;
set local role authenticated;
do $$
begin
  perform public.admin_resumen();
  raise exception 'FALLO: authenticated pudo ejecutar admin_resumen';
exception when insufficient_privilege then
  raise notice 'OK: authenticated rechazado';
end $$;
do $$
begin
  perform * from public.admin_usuarios(null, 'todos', 1, 0);
  raise exception 'FALLO: authenticated pudo ejecutar admin_usuarios';
exception when insufficient_privilege then
  raise notice 'OK: authenticated rechazado en admin_usuarios';
end $$;
reset role;
set local role anon;
do $$
begin
  perform public.admin_sistema();
  raise exception 'FALLO: anon pudo ejecutar admin_sistema';
exception when insufficient_privilege then
  raise notice 'OK: anon rechazado';
end $$;
reset role;

rollback;
```

## Sugerencias abiertas

- Costos de IA: para ver USD hace falta una tabla mínima, por ejemplo `ai_usage_costs (id, owner_id, feature, model, input_tokens, output_tokens, cost_usd numeric(10,6), created_at)` que escriban las Edge Functions de IA con los tokens que devuelve el modelo. Con eso `admin_ia()` y `admin_resumen()` pueden sumar el costo del día y del mes.
- Códigos promocionales de Moni Plus: ya existen (`plus_entitlements`, `promo_redemptions`, `redeem_promo_code`). No se construyó nada para crearlos desde el panel; si hace falta, sería una acción nueva con su propia auditoría.
