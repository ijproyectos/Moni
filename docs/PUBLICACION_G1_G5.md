# Publicación conjunta de G1–G5 (procedimiento preparado — NADA publicado ni aplicado todavía)

Estado verificado (solo lectura sobre producción) el 2026-11-21: aplicado únicamente el **lote A de G1** (`20261126000000`).
Pendiente de aplicar, en este orden: **B** (`20261126000100`, `…000200`, `…000300`) → **G2** (`20261127000000`) → **G3**
(`20261128000000`) → **G4** (`20261129000000`) → **G5** (`20261130000000`). Script: `supabase/ops/g1_prod.cjs` (lotes A–F).

## 0. Qué se probó de forma integrada
- Toda la cadena de migraciones del repositorio (incluidas las 4 que ya están en producción) se aplica en orden sin errores, y una
  prueba integrada de 107 comprobaciones sobre el estado «producción hoy + B → G5» confirma: ninguna migración cambia saldos ni
  gastos; los grupos ocultos siguen contando deudas y recibiendo avisos; códigos solo para administradores; solicitud e invitación
  sin acceso previo; pagos informados que no saldan hasta confirmar; recurrentes sin gastos automáticos y sin duplicados; y la
  forma final de los objetos compartidos (restricciones de `notifications`, los 3 triggers de push, política de códigos).
- Qué objeto define cada migración (lo último aplicado gana, es lo intencional): `push_group_notice` G2→G3→G4→G5 (la de G5 trae todos
  los tipos y la privacidad); `create_group_invite` B (administradores) → G2 (aprobación); `join_group` G2; `notifications` (restricciones)
  G2→G3→G5; `push_debt_reminder` G4. Ninguna sobrescribe algo anterior sin conservar su comportamiento.

## 1. Compatibilidad app nueva ↔ base (por eso el orden)
| | Base actual (solo A) | Base con B…G5 |
|---|---|---|
| **App nueva** | Funciona. Lo que depende de funciones nuevas queda oculto o vacío (contactos, solicitudes, preferencias, recurrentes) y «Hogar» se envía como `casa`, que la base acepta antes y después del cambio. Solo fallan, con mensaje, las acciones nuevas que necesitan su función (renombrar, crear recurrentes). | Funciona completa. |
| **App vieja** (pestañas o PWA sin actualizar) | Funciona. | Funciona con diferencias menores: un integrante no puede invitar con códigos (ahora solo administradores), el último administrador no puede salir sin nombrar otro, el grupo «Hogar» (antes Casa) puede verse sin ícono, y los avisos nuevos (solicitudes, invitaciones, recurrentes) se ven con texto incompleto. |
**Conclusión: publicar PRIMERO la app y DESPUÉS las migraciones**, con la menor demora razonable entre ambas, y ofrecer a las
personas recargar la app (el service worker actualiza en la siguiente apertura).

## 2. Procedimiento
**Antes (sin cambios en producción)**
1. `git status` limpio salvo lo de G1–G5; `npx tsc -b`, `npx eslint . --max-warnings 0`, `npx vitest run`, `npm run build` en verde.
   No subir `docs/SPRINT_1.md`, `.github/workflows/desings/` ni nada de `~/Desktop/MONI/backups-g1/`.
2. Confirmar un respaldo de la plataforma (Supabase → Database → Backups; el archivado continuo está activo) y correr
   `g1_prod.cjs backup` (queda fuera del repo). `g1_prod.cjs preflight --lote=B` debe dar GO.
3. Elegir una ventana de bajo uso.

**Publicar (cada paso con tu autorización)**
4. Commit con mensaje en español y `git push` a `main` → Netlify publica. Esperar el deploy y hacer una prueba rápida contra la base
   actual: entrar, Inicio, lista de Grupos, abrir un grupo, crear un grupo de prueba.
5. Aplicar en orden, uno por uno, con `NODE_PATH=<carpeta con pg>/node_modules`:
   `preflight --lote=X` → `backup` → `G1_AUTORIZADO=SI apply --lote=X` → `verify`, para X = **B, C, D, E, F**. Cada archivo corre en su
   transacción y se registra en `schema_migrations`; el script compara la huella de saldos/gastos antes y después y se detiene ante
   cualquier diferencia. No usar `supabase db push` ni pegar los archivos a mano.
6. Las 4 migraciones que ya estaban en producción y faltaban en `main` (`20261121`, `20261124`, `20261125`, `20261125000100`, de la
   rama `feat/mp-agent-fase1`) ya están copiadas al repo, y las funciones que definen coinciden con las de producción. Quedan como
   referencia: **no se vuelven a ejecutar** (están registradas en `schema_migrations`; el preflight lo comprueba).
7. (Opcional, otra autorización) activar el cron diario de recurrentes: `supabase/ops/group_recurring_cron.sql`. Solo crea períodos
   pendientes y avisos; nunca gastos.

**Después**
8. `g1_prod.cjs verify`; revisar: 11 grupos / 17 integrantes / gastos y saldos iguales; `casa` → `hogar`; lista de grupos de cada
   cuenta de prueba. Con un grupo de prueba: ocultar/restaurar, administrador, solicitud con código nuevo, invitación a contacto,
   «Ya pagué» → confirmar/rechazar, recurrente → confirmar (un toque, sin duplicado), preferencias de avisos.

## 3. Recuperación
- **Falla una migración:** esa se revierte sola; las anteriores quedan aplicadas. Se detiene y se informa el estado antes de tocar nada.
- **Volver atrás:** ejecutar las reversiones en orden inverso: `group_recurring_expenses_rollback.sql` (F), `group_payment_notices_rollback.sql`
  (E), `group_contacts_invitations_rollback.sql` (D), `group_join_requests_rollback.sql` (C), `shared_category_otros_rollback.sql`,
  `group_kind_hogar_rollback.sql`, `group_admin_enforcement_rollback.sql` (B). Cada una está probada y solo borra tablas/avisos nuevos:
  nunca gastos, pagos ni saldos (los gastos registrados desde recurrentes se conservan).
- **Última red:** `restore_g1.sql` del respaldo (funciones, políticas, tipos y roles previos a G1) y, para un desastre, la recuperación
  a un punto en el tiempo de la plataforma.
- **App:** en Netlify, «Publish deploy» del deploy anterior (la base nueva sigue funcionando con la app vieja, con las diferencias de la tabla).

## 4. Autorizaciones que se necesitan
1. Commit + push (y por lo tanto deploy automático) de G1–G5. 2. Aplicar B. 3. Aplicar G2. 4. Aplicar G3. 5. Aplicar G4. 6. Aplicar G5.
7. (Opcional) activar el cron diario. Cada aplicación se repite con preflight y respaldo frescos.
