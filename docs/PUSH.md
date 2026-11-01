# Avisos push de Moni

Sirven para mandar a las personas que los activaron (Perfil › Avisos de Moni) un aviso de mantenimiento, un pedido de opinión o una novedad. Los envía solo quien tenga el secreto de administración, con `curl`.

Piezas: tabla `push_subscriptions` (un registro por navegador), tabla `push_messages` (historial de envíos), Edge Function `push-send` y el service worker (`public/push-sw.js`).

## 1. Generar las claves VAPID

```sh
npx web-push generate-vapid-keys
```

Da una clave pública y una privada. La privada no se comparte ni se commitea. Generá además un secreto de administración largo y aleatorio (por ejemplo `openssl rand -base64 32`).

## 2. Dónde va cada cosa

| Dónde                | Nombre                  | Valor                        |
| -------------------- | ----------------------- | ---------------------------- |
| Secrets de Supabase  | `PUSH_ADMIN_SECRET`     | el secreto de administración |
| Secrets de Supabase  | `VAPID_PUBLIC_KEY`      | clave pública                |
| Secrets de Supabase  | `VAPID_PRIVATE_KEY`     | clave privada                |
| Secrets de Supabase  | `VAPID_SUBJECT`         | `mailto:tu-mail@ejemplo.com` |
| Variables de Netlify | `VITE_VAPID_PUBLIC_KEY` | la misma clave pública       |

Sin `VITE_VAPID_PUBLIC_KEY` la fila «Avisos de Moni» no aparece en Perfil. Después de cargar la variable en Netlify hace falta un deploy nuevo. Si cambiás las claves VAPID, quienes ya activaron los avisos tienen que desactivarlos y volver a activarlos.

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

- `kind`: `maintenance`, `feedback` o `news`.
- `title`: hasta 80 caracteres. `body`: hasta 240.
- `url` (opcional): ruta dentro de la app que se abre al tocar el aviso, siempre empezando con `/`.
- `audience`: `all` (todos) o `user` (una persona; agregá `"user_id": "<uuid>"`).
- `dry_run` (opcional): con `true` solo cuenta destinatarios y no envía nada ni guarda en el historial.

Respuesta: `{"sent": N, "failed": N, "removed": N}`. Con `dry_run`: `{"dry_run": true, "recipients": N}`. Probá siempre primero con `"dry_run": true`, o con `"audience": "user"` y tu propio `user_id`.

Un `401` sin detalle significa secreto incorrecto o ausente.

## 4. Limitaciones

- **iPhone / iPad**: iOS solo entrega avisos web a la app instalada. Hay que abrir Moni en Safari, tocar Compartir › «Agregar a pantalla de inicio» y activar los avisos desde la app instalada (iOS 16.4 o superior).
- Si la persona bloquea las notificaciones en el navegador, la app no puede volver a pedir permiso: tiene que habilitarlas en los ajustes del sitio.
- Los avisos duran 24 horas en el servicio de push: si el dispositivo está apagado más tiempo, no le llegan.

## 5. Endpoints muertos

Cuando el servicio de push responde 404 o 410, ese dispositivo ya no existe (se desinstaló la app, se limpiaron los datos o se revocó el permiso). `push-send` borra esa suscripción en el mismo envío y la cuenta en `removed`. Otros errores se cuentan en `failed` y la suscripción se conserva. El historial queda en `push_messages` (solo accesible con service role).
