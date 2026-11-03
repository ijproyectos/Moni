# Avisos push de Moni

Sirven para mandar un aviso de mantenimiento, un pedido de opinión, una novedad, el recordatorio de cada noche y el aviso de vencimiento de Plus. Los envía solo quien tenga el secreto de administración (con `curl`), el panel `/adminmoni` o los dos cron de la base.

Piezas: tabla `push_subscriptions` (un registro por navegador), tabla `push_messages` (historial de envíos), Edge Function `push-send`, el service worker (`public/push-sw.js`) y dos tareas de `pg_cron` (`moni-nightly-push`, `moni-plus-expiry`).

## 0. Siempre activos

Los avisos no se pueden apagar desde la app:

- Con el permiso del navegador ya concedido, al abrir la app el dispositivo se suscribe solo (en silencio). Si la suscripción venció o se hizo con otra clave VAPID, se reemplaza sola.
- Con el permiso sin decidir, el Inicio muestra una tarjeta «Activá los avisos de Moni» en cada arranque hasta que la persona acepta. «Ahora no» solo la oculta hasta el próximo arranque: no hay «no volver a mostrar».
- En iPhone / iPad sin la app instalada, la tarjeta explica cómo instalarla.
- Perfil › Avisos de Moni es informativo («Siempre activos en este dispositivo»), sin interruptor. Si falta el permiso ofrece el botón «Activar».
- La base lo refuerza: se quitó el permiso `DELETE` y la función `remove_push_subscription`. Solo el servidor (`push-send` / `admin-panel`) borra una suscripción, cuando el servicio de push informa que ese dispositivo ya no existe.
- Las cuentas suspendidas no reciben nada.

**Límite técnico que no se puede saltear:** el navegador y el sistema operativo no permiten forzar el permiso. Si alguien lo bloquea en los ajustes del dispositivo, no hay forma de enviarle avisos; la app solo puede mostrar cómo reactivarlos.

## 1. Generar las claves VAPID

```sh
npx web-push generate-vapid-keys
```

Da una clave pública y una privada. La privada no se comparte ni se commitea. Generá además un secreto de administración largo y aleatorio (por ejemplo `openssl rand -base64 32`).

## 2. Dónde va cada cosa

| Dónde                | Nombre                  | Valor                                  |
| -------------------- | ----------------------- | -------------------------------------- |
| Secrets de Supabase  | `PUSH_ADMIN_SECRET`     | el secreto de administración           |
| Secrets de Supabase  | `PUSH_CRON_SECRET`      | el secreto de los cron (ver sección 6) |
| Secrets de Supabase  | `VAPID_PUBLIC_KEY`      | clave pública                          |
| Secrets de Supabase  | `VAPID_PRIVATE_KEY`     | clave privada                          |
| Secrets de Supabase  | `VAPID_SUBJECT`         | `mailto:tu-mail@ejemplo.com`           |
| Variables de Netlify | `VITE_VAPID_PUBLIC_KEY` | la misma clave pública                 |

Sin `VITE_VAPID_PUBLIC_KEY` la fila «Avisos de Moni» no aparece en Perfil y la app no se suscribe. Después de cargar la variable en Netlify hace falta un deploy nuevo. Si cambiás las claves VAPID, cada dispositivo se vuelve a suscribir solo la próxima vez que abre la app (detecta la clave vieja y la reemplaza).

## 3. Mandar un aviso

El secreto se lee sin mostrarlo ni dejarlo en el historial de la terminal:

```sh
read -s PUSH_ADMIN_SECRET
export PUSH_ADMIN_SECRET

curl -sS -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/push-send" \
  -H "x-moni-push-secret: $PUSH_ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "kind": "maintenance",
    "title": "Mantenimiento programado",
    "body": "Hoy a las 23 hs Moni va a estar unos minutos fuera de servicio.",
    "url": "/actividad",
    "audience": "all"
  }'
```

Campos:

- `kind`: `maintenance`, `feedback`, `news`, `reminder`, `plus_expiry` o `support`.
- `title`: hasta 80 caracteres. `body`: hasta 240.
- `url` (opcional): ruta dentro de la app que se abre al tocar el aviso, siempre empezando con `/`.
- `audience`: `all` (todos) o `user` (una persona; agregá `"user_id": "<uuid>"`).
- `dry_run` (opcional): con `true` solo cuenta destinatarios y no envía nada ni guarda en el historial.

Respuesta: `{"sent": N, "failed": N, "removed": N}`. Con `dry_run`: `{"dry_run": true, "recipients": N}`. Probá siempre primero con `"dry_run": true`, o con `"audience": "user"` y tu propio `user_id`.

Un `401` sin detalle significa secreto incorrecto o ausente.

## 4. Limitaciones

- **iPhone / iPad**: iOS solo entrega avisos web a la app instalada. Hay que abrir Moni en Safari, tocar Compartir › «Agregar a pantalla de inicio» y activar los avisos desde la app instalada (iOS 16.4 o superior).
- Si la persona bloquea las notificaciones en el navegador, la app no puede volver a pedir permiso: tiene que habilitarlas en los ajustes del sitio (Perfil › Avisos de Moni se lo explica).
- Los avisos duran 24 horas en el servicio de push: si el dispositivo está apagado más tiempo, no le llegan.

## 5. Endpoints muertos

Cuando el servicio de push responde 404 o 410, ese dispositivo ya no existe (se desinstaló la app, se limpiaron los datos o se revocó el permiso). `push-send` borra esa suscripción en el mismo envío y la cuenta en `removed`. Otros errores se cuentan en `failed` y la suscripción se conserva. El historial queda en `push_messages` (solo accesible con service role).

## 6. Avisos programados

Los dos corren en `pg_cron` (hora UTC) y llaman a `push-send` con el secreto `PUSH_CRON_SECRET`. La URL y el secreto se leen en cada ejecución de `private.app_secrets` (`supabase_url` y `push_cron_secret`): no están en el texto del cron. Si falta alguno, la tarea no hace nada (no falla). Cada una tiene un interruptor en `/adminmoni › Sistema › Avisos automáticos`, que queda registrado.

| Tarea               | Horario (Argentina)  | Cron UTC     | Qué envía                                                                                  |
| ------------------- | -------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| `moni-nightly-push` | todos los días 21:00 | `0 0 * * *`  | A todos: título «Moni», texto «Cargaste tus gastos de hoy», abre `/`                       |
| `moni-plus-expiry`  | todos los días 12:00 | `0 15 * * *` | A quienes pierden Plus en 3 días y en 1 día (calendario de Argentina), con `url` `/perfil` |

Aviso de vencimiento de Plus: el vencimiento real está en `plus_entitlements.expires_at`. Una suscripción de Mercado Pago `authorized` renueva sola (cada pago suma un mes), así que **no** se avisa a quienes la tienen; sí a quienes tienen el Plus por código promocional, o una suscripción pausada o cancelada. No hay período de gracia: Plus termina en `expires_at`. `plus_expiry_notices` guarda un registro por (persona, fecha de vencimiento, nivel): un nivel se avisa una sola vez, y si renueva (fecha nueva) empieza de nuevo. Quien no tiene ningún dispositivo con avisos se salta sin gastar el nivel. Desde el panel, «Avisar ahora» manda el mismo aviso a una persona (máximo 30 por hora por admin).

### Activarlos (una sola vez)

El valor del secreto no pasa por el chat ni queda en el historial de la terminal. Desde la carpeta `moni-mvp`:

```sh
NEW=$(openssl rand -hex 32)
supabase secrets set PUSH_CRON_SECRET="$NEW" --project-ref ovgzwbhfvyjwpqhyilpq
supabase db query --linked "select private.set_app_secret('push_cron_secret', '$NEW')"
unset NEW
```

`private.app_secrets` ya tiene `supabase_url` (lo usa el cron de Mercado Pago). Para rotarlo, repetir los tres comandos.

### Verificar

```sql
select jobname, schedule, active from cron.job where jobname in ('moni-nightly-push', 'moni-plus-expiry');
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
```

Probar a mano sin esperar al horario (`PUSH_ADMIN_SECRET` o `PUSH_CRON_SECRET` sirven): `{"job": "plus_expiry"}` ejecuta el aviso de vencimiento; el recordatorio es un envío común (`"kind": "reminder"`, `"audience": "all"`, probalo con `"dry_run": true`).
