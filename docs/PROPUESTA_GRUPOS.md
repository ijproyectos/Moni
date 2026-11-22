# Propuesta funcional — módulo Grupos (para aprobar antes de implementar)

Estado: **solo propuesta**. No se modificó código ni Supabase. Las migraciones se preparan como archivos y **no se aplican**
sin tu autorización y un respaldo previo. Referencia visual: carpeta `designs` y las mascotas ya incluidas en la app
(`personaje_gastos-en-grupo.svg`, `personaje_notificaciones.svg`, `expresion_*.svg`).

## 0. Auditoría: lo que ya existe (y no se duplica)

| Tema | Hoy |
|---|---|
| Roles | `group_members.role` ∈ `owner`/`member`. El creador es `owner`. Hoy el `owner` solo sirve para revocar códigos de otros y heredar el grupo cuando el último owner se va (`leave_group` promueve al integrante más antiguo). |
| Invitaciones | Códigos de 12 caracteres (`group_invites`: vence 7 días, 20 usos, hasta 5 activos). **Cualquier integrante** puede crearlos. `join_group(code)` **mete directo** al grupo, con límite de 10 intentos fallidos por hora. `preview_group_invite` muestra lo mínimo antes de entrar. |
| Salir | `leave_group`: exige saldo 0; marca `left_at`; si queda vacío, archiva el grupo y revoca códigos. |
| **Eliminar grupo** | **No existe en el servidor.** La app marca el grupo como borrado solo en memoria (`patchOverlay({deleted:true})`) y muestra «Grupo eliminado». No hay RPC ni política de borrado, y todas las FKs son `on delete no action`. Es un simulacro y debe reemplazarse. |
| Pagos entre integrantes | Ya hecho (migraciones `20261111…`, `20261122…`): `remind_debt` (1 por deuda cada 24 h, verifica que la deuda exista), `report_payment` («Ya pagué»), `confirm_payment_report`, `reject_payment_report`, `cancel_payment_report`. Estados: `reported` → `confirmed` / `rejected` / `cancelled`. Un solo reporte abierto por par. Confirmar crea la `settlement` real, sin duplicar. |
| Notificaciones | Tabla `notifications` (`debt_reminder`, `payment_reported`, `payment_confirmed`, `payment_rejected`) con RLS por destinatario. **Push solo para `debt_reminder`** (trigger `push_debt_reminder`, abre `/grupos/avisos`). Los otros tres tipos son solo dentro de la app. No hay preferencias por tipo ni opción de ocultar el contenido. |
| Push (infra) | `push_subscriptions`, función `push-send`, service worker que abre la `url` al tocar. Funciona en Android/Chrome y en iPhone **solo con la PWA instalada** (iOS 16.4+). |
| Recurrentes | `fixed_expenses` es **personal** (por dueño). Crea «ocurrencias» que la persona confirma (nunca cobra sola). Funciones reutilizables: `fixed_expense_due_on`, `process_fixed_expenses_core` (patrón idempotente con `request_key`). |
| Invitados sin cuenta | `group_guests` + `link_group_guest` (migra su historial a un usuario real). |
| Categoría en gastos compartidos | Usan `template_slug` de `category_templates`; **no existe la plantilla «otros»**. |
| Contactos | No existe. `profiles` solo es legible por su dueño; los nombres de co-integrantes salen por `get_group_members` (security definer). |

Dos cosas a verificar contigo antes de migrar: (a) si `20261122…` y `20261123…` ya están aplicadas en producción (están en el
repo; no puedo consultarlo); (b) la lista de migraciones de producción vs repo antes de numerar las nuevas.

---

## 1. Administradores y permisos

**Hoy:** ver arriba. **Propuesta:** «Administrador» = rol `owner` (se mantiene el nombre interno para no romper datos ni
funciones; la interfaz dice «Administrador»). Se permite **más de un administrador** (el creador puede promover), con mínimo uno.

| Acción | Administrador | Integrante |
|---|:-:|:-:|
| Ver grupo, gastos, saldos, integrantes | ✔ | ✔ |
| Cargar/editar/anular **sus** gastos y pagos | ✔ | ✔ |
| Ver y compartir el código vigente | ✔ | ✔ |
| Crear/revocar códigos, cambiar «requiere aprobación» | ✔ | ✘ (hoy pueden crear; se restringe) |
| Aprobar/rechazar solicitudes, invitar contactos | ✔ | ✘ |
| Hacer/quitar administrador | ✔ | ✘ |
| Quitar integrante | ✔ (saldo 0 y sin pagos abiertos) | ✘ |
| Editar nombre, foto, tipo | ✔ | ✘ |
| Eliminar para todos | ✔ | ✘ |
| Salir / ocultar para sí | ✔ (si es el único admin, debe nombrar otro o archivar) | ✔ |
| Recordar pago / registrar pago / confirmar | ✔ | ✔ (solo en deudas propias) |

**Migración:** `is_group_admin(p_group)` (helper), `set_member_role(group, user, role)`, `remove_group_member(group, user)`.
**Casos:** el último admin no puede perder el rol; quitar a alguien con saldo ≠ 0 se bloquea (misma regla de `leave_group`);
el integrante quitado conserva sus movimientos personales; un admin que sale con otros miembros activos se reemplaza por
promoción (ya existe).
**Riesgos:** cambia el permiso de crear códigos (hoy abierto). **Pruebas:** matriz de permisos con 3 usuarios (admin, miembro,
ajeno) en SQL; cada RPC debe rechazar al ajeno y al miembro.

## 2. Invitaciones: solicitudes, aprobación, códigos y enlaces

**Nuevo flujo:** el código **no da acceso**. 1) la persona ingresa el código o abre el enlace; 2) Moni crea una **solicitud
pendiente**; 3) los administradores reciben aviso (push + bandeja); 4) aceptan o rechazan; 5) solo al aceptar se crea la
membresía. La persona ve «Solicitud enviada, esperando al administrador» y puede cancelarla.

- Opción por grupo `join_mode`: `approval` (nuevo estándar) o `open` (comportamiento actual).
  **Decisión tuya:** ¿grupos existentes quedan en `open` (no cambia nada hasta que el admin lo active; recomendado) o pasan a
  `approval`?
- Antes de aprobar, el solicitante ve solo lo que ya muestra `preview_group_invite` (nombre y cantidad); **ningún** gasto,
  saldo ni integrante. La solicitud no cuenta como membresía, así que las políticas RLS existentes (`is_group_member`) no le
  dan acceso.
- Límites: máximo 20 solicitudes pendientes por grupo; una abierta por persona; el contador de intentos fallidos actual se
  mantiene; las solicitudes vencen a los 14 días.
- Pantallas: **Pedir ingreso** (estado de la solicitud), **Solicitudes** dentro de «Administrar grupo» (tarjeta con nombre,
  Aceptar/Rechazar), insignia de pendientes en la lista de grupos.
- **Supabase:** `groups.join_mode`; tabla `group_join_requests` (id, group_id, user_id, invite_id, status
  `pending|approved|rejected|cancelled|expired`, resolved_by, timestamps; índice único parcial por grupo+usuario pendiente;
  RLS: la ve el solicitante y los admins); RPC `join_group` modificada (devuelve estado), `approve_join_request`,
  `reject_join_request`, `cancel_join_request`. Las solicitudes de integrantes que ya están (idempotencia) se tratan como hoy.
- **Casos:** el admin aprueba mientras el grupo se archivó; el solicitante ya fue quitado antes (puede volver a pedir, el admin
  decide); doble aprobación simultánea (bloqueo por fila); admin que se va con solicitudes pendientes (quedan para los demás).
- **WhatsApp/compartir:** el mensaje nuevo ya está resuelto (un solo enlace + código); falta la prueba en iPhone/Android.
- **Pruebas:** solicitud sin acceso a datos; aprobar/rechazar solo por admin; no se puede aprobar dos veces; expiración.

## 3. Contactos frecuentes («Personas de Moni»)

**Hoy:** no existe; cada grupo nuevo exige un código. **Propuesta (consentimiento primero):**

1. **Lista derivada:** RPC `get_my_contacts()` devuelve solo `user_id`, nombre y foto de usuarios **reales** con los que
   compartí (o comparto) un grupo. No incluye invitados sin cuenta ni qué grupos compartimos. No es una búsqueda global de
   usuarios: solo se busca por nombre dentro de esa lista.
2. **Invitación directa (por defecto):** al crear un grupo o desde «Administrar», el admin elige un contacto → se crea una
   `group_invitation` pendiente → la otra persona recibe aviso y **acepta o rechaza**. Sin respuesta, vence a los 7 días.
3. **Agregado directo (solo con consentimiento):** si el contacto activó previamente «Permitir que X me agregue
   directamente», el admin puede sumarlo sin pasos. El consentimiento es **por persona y revocable**, y nunca se activa solo
   por haber compartido un grupo.
4. **Control:** ocultar un contacto de mi lista; **bloquear** invitaciones de una persona (no puede invitarme ni recordarme
   pagos desde grupos nuevos; los grupos existentes y las deudas reales no se alteran).
5. **Privacidad:** compartir un grupo anterior no da acceso a movimientos, cuentas ni saldos personales de nadie.

- **Supabase:** `contact_prefs` (owner, contact, hidden, blocked, allow_direct_add_by_contact), `group_invitations`
  (group, invited_user, invited_by, status, expiración; RLS: invitado e invitador/admins), RPC `get_my_contacts`,
  `invite_contact`, `respond_invitation`, `add_contact_directly` (verifica el consentimiento en el servidor), `set_contact_pref`.
- **Pantallas:** en **Crear grupo** una fila «Personas de Moni» con buscador y chips; en **Administrar → Invitar** pestañas
  «Contactos / Código y enlace»; **Ajustes → Privacidad → Personas de Moni** (ocultar, bloquear, permitir agregado directo);
  **Invitaciones recibidas** (en Avisos).
- **Casos:** invitar a alguien bloqueado (se rechaza sin revelar); contacto que borró su cuenta; invitación a quien ya está.
- **Riesgos:** privacidad; por eso el agregado directo queda en una **segunda fase** (decisión tuya abajo).
- **Pruebas:** nadie aparece en contactos sin grupo compartido; bloqueo y consentimiento verificados en el servidor.

## 4. Eliminar grupos

**Hoy:** simulacro en memoria (no elimina). **Propuesta: tres acciones distintas, nunca borrado definitivo desde la app.**

| Acción | Quién | Efecto | Condición |
|---|---|---|---|
| **Quitar de mi cuenta** (ocultar) | cualquiera | El grupo deja de verse para mí; sigo siendo integrante, mis saldos y deudas siguen vigentes; se ve en «Ocultos» y puedo restaurarlo | ninguna |
| **Salir del grupo** | cualquiera | Dejo de ser integrante (ya existe `leave_group`) | saldo 0 |
| **Eliminar para todos** | administrador | **Archiva** el grupo: queda de solo lectura, no se pueden cargar gastos ni invitar; desaparece de la lista principal y pasa a «Archivados» | ver abajo |

- **Con deudas pendientes:** si todos los saldos están en 0 y no hay reportes de pago abiertos → se archiva tras confirmar
  escribiendo el nombre del grupo. Si hay deudas, **no se archiva en silencio**: el aviso lista quién debe a quién y ofrece
  «Saldar primero» o «Archivar igual (quedará solo para consultar y saldar)». Un grupo archivado con deudas permite seguir
  registrando/confirmando pagos entre integrantes hasta saldar. **Decisión tuya:** ¿permitir «Archivar igual»?
- Todos los integrantes reciben un aviso; los datos se conservan (retención). El borrado físico, si algún día se necesita, sería
  una tarea administrativa fuera de la app.
- **Supabase:** `group_members.hidden_at`; RPC `hide_group_for_me`, `restore_group_for_me`, `archive_group_for_all(group,
  name_confirmation, force_with_debts)`; reutiliza `groups.archived_at` (ya bloquea escrituras) y `group_balance_rows`.
- **Pantallas:** «Administrar grupo → Zona delicada» con las tres acciones y textos distintos; filtros «Activos / Ocultos /
  Archivados» en la lista; la interfaz solo confirma **después** de la respuesta del servidor (hoy confirma antes).
- **Casos:** admin único que quiere salir; pago en trámite al archivar; reaparición de un grupo oculto cuando llega un gasto.
- **Pruebas:** archivar con saldos; escritura rechazada en archivado; ocultar no afecta saldos de otros.

## 5. Hogar y gastos compartidos recurrentes

**Hoy:** tipo `casa` (restricción en base) y no hay recurrentes compartidos.

**Tipo:** reemplazar «Casa» por **Hogar**. Migración segura en tres pasos para no romper apps con caché antigua: (1) `create_group`
acepta `hogar` y trata `casa` como alias; (2) `update … set kind='hogar' where kind='casa'`; (3) nueva restricción
`('hogar','viaje','pareja','amigos')`. Se conservan nombre, integrantes y datos. Etiqueta e ícono en la interfaz.

**Recurrentes compartidos (Fase 1, segura):** tabla `group_recurring_expenses` (descripción, monto estimado, plantilla de
categoría, quién paga, período mensual/bimestral/anual, ancla, ciclo, estado) con su reparto (`equal` o `percent`, los métodos
que existen). Cada vencimiento genera una **ocurrencia pendiente** (como `fixed_expenses`): al pagador le llega aviso («Hoy vence
el alquiler: $600.000») y la confirma con un toque, pudiendo ajustar el monto (útil para luz/gas). Al confirmar se crea el
`shared_expense` normal. Idempotencia: índice único `(recurring_id, ciclo)` en el gasto generado → imposible duplicar; el
procesamiento de ciclos atrasados reutiliza el patrón de `process_fixed_expenses_core` con tope.
Ejemplo: alquiler $600.000, 3 personas, partes iguales → $200.000 cada una.

**Fase 2 (requiere tu aprobación de regla financiera):** carga **automática** de montos fijos (alquiler/expensas) el día del
vencimiento, solo en el libro del grupo (sin tocar cuentas personales). **Importes personalizados** por persona: hoy el
sistema solo soporta `equal` y `percent`; sumarlo exige un nuevo método `amount` en funciones financieras (no lo cambio sin
tu aprobación).

- **Pantallas:** pestaña **Recurrentes** en el grupo Hogar (lista con próxima fecha, monto, reparto, pausar/editar);
  «Nuevo recurrente» con el catálogo de `fixedExpenses/domain/catalog.ts` (alquiler, expensas, luz, gas, agua, internet…).
- **Casos:** integrante que entra o sale a mitad de ciclo (el reparto se toma al confirmar la ocurrencia, con los integrantes
  de ese momento y aviso si cambió); pagador que se va (se reasigna); monto distinto al estimado; ocurrencias vencidas sin
  confirmar (se acumulan con tope, sin generar deuda automática).
- **Riesgos:** alto (saldos). **Pruebas:** idempotencia, suma exacta de partes (centavos), ciclos atrasados, integrantes cambiantes.

## 6. Deudas y pagos (revisión; sin duplicar)

Ya cubierto: recordar (24 h, deuda real), «Ya pagué», confirmar (con cuenta opcional), rechazar, cancelar. **Estados pedidos =
estados existentes:** pendiente de confirmación (`reported`), confirmado (`confirmed`), rechazado (`rejected`), + cancelado.
Registrar un pago **no** cierra la deuda hasta que el acreedor confirma, y confirmar no duplica movimientos (índice de un solo
reporte abierto + `settlement` única).

**Brechas reales a cerrar (no reconstruir):**
1. Push solo para recordatorios → agregar push a `payment_reported`, `payment_confirmed`, `payment_rejected`.
2. Textos: hoy «🐱 Moni te recuerda / Tenés $15.000 pendientes con Iara». Se ajusta a «Jonatan te recordó que tenés un pago
   pendiente de $20.000 en Moni» y «Jonatan registró un pago de $20.000. Revisalo en Moni».
3. Al tocar, abre `/grupos/avisos`; se propone abrir directamente el aviso (`?aviso=<id>`) con los botones **Confirmar /
   Rechazar** del reporte.
4. Preferencias y pantalla bloqueada (ver §7).
5. Verificar en pruebas que nadie recuerde deudas ajenas (la función ya lo exige; se agrega el caso a la matriz de pruebas).

## 7. Notificaciones: cuándo, a quién y qué abre

| Evento | Quién recibe | Push | Al tocar abre |
|---|---|:-:|---|
| Solicitud de ingreso | administradores | nuevo | Administrar → Solicitudes |
| Solicitud aprobada / rechazada | solicitante | nuevo | el grupo / lista de grupos |
| Invitación directa | invitado | nuevo | Avisos → Invitación (Aceptar/Rechazar) |
| Te quitaron de un grupo / se archivó | afectado / todos | nuevo | lista de grupos (sin datos del grupo) |
| Recordatorio de deuda | deudor | existe | aviso de la deuda |
| Pago registrado | acreedor | nuevo (hoy solo in-app) | aviso con Confirmar/Rechazar |
| Pago confirmado / rechazado | deudor | nuevo | aviso del pago |
| Recurrente por vencer / vencido | quien paga | nuevo | Hogar → Recurrentes |

- **Preferencias** (nueva tabla `notification_prefs`): activar por tipo (deudas, pagos, grupos, recurrentes) y **«Ocultar
  contenido en pantalla bloqueada»** (el push dice «Tenés un aviso en Moni» sin montos ni nombres). Respeta los avisos ya
  activados por dispositivo (`PushNotificationsRow`).
- Anti-spam: reutiliza el límite de 24 h de recordatorios; solicitudes/invitaciones con tope por persona y por hora; un push
  por evento (la fila de `notifications` es única, el trigger no reenvía).
- Infra: se generaliza el trigger actual para todos los `kind`, manteniendo que un fallo de push **nunca** bloquea la acción.
  **iPhone:** solo con la PWA instalada; Android/Chrome y escritorio funcionan en navegador. Hay que probarlo en dispositivos.

## 8. Seguridad (RLS, roles, privacidad)

Principios (los mismos del módulo actual): lectura por RLS limitada a quien corresponde; **todas las escrituras por RPC
`security definer` con `search_path=''`**, validando `auth.uid()` y rol en el servidor; sin `insert/update/delete` directos
para `authenticated`.
- Nuevo helper `is_group_admin`; tablas nuevas con RLS (solicitudes: solicitante + admins; invitaciones: invitado + admins;
  contactos: solo el dueño; recurrentes: integrantes del grupo; prefs: solo el dueño).
- Los solicitantes y los invitados **no** son miembros hasta aceptar → no heredan lectura de gastos, saldos ni integrantes.
- `get_my_contacts` solo devuelve nombre y foto, nunca grupos compartidos ni datos financieros.
- Rate limits en servidor (solicitudes, invitaciones, recordatorios); mensajes de error uniformes para no revelar si un
  código/usuario existe.
- **Pruebas:** suite SQL con PGlite (como la del onboarding, 37/37) con 3–4 usuarios: cada RPC y tabla probada contra admin,
  miembro, solicitante, invitado y ajeno; más pruebas de interfaz (Vitest) y verificación manual en 360/390/430 px, claro/oscuro.

## 9. Distribución visual propuesta (estilo actual de Moni)

```
LISTA DE GRUPOS                         ADMINISTRAR GRUPO (⋯ en el detalle)
┌───────────────────────────┐           ┌───────────────────────────┐
│ Grupos      [Activos ▾]   │           │ ‹  Hogar            ⋯     │
│ ┌ Te deben / Debés ─────┐ │           │ Integrantes (3)           │
│ └───────────────────────┘ │           │  ● Iara   Administradora  │
│ [Crear] [Entrar con código]│          │  ● Jonatan  Integrante ⋯  │
│ ● Hogar        2 pendientes│          │ Solicitudes (2)  ▸        │
│ ● Viaje Bariloche         │           │ Invitar                   │
│ ▸ Ocultos · Archivados    │           │  [Contactos][Código/enlace]│
└───────────────────────────┘           │ Requiere aprobación [●─]  │
                                        │ ─ Zona delicada ─         │
CREAR GRUPO                             │ Quitar de mi cuenta       │
│ Nombre · Tipo (Hogar…)    │           │ Salir del grupo           │
│ Personas de Moni  🔍      │           │ Eliminar para todos (rojo)│
│ (Jonatan) (Ana) (+ código)│           └───────────────────────────┘
HOGAR → pestaña «Recurrentes»           AVISOS
│ Alquiler  $600.000 /mes   │           │ Jonatan registró un pago  │
│ 3 personas · $200.000 c/u │           │ $20.000  [Rechazar][Confirmar]│
│ Próx.: 5 dic   ⏸ ✎        │           │ Solicitud de Ana [No][Aceptar]│
```
Usa los componentes actuales (`BottomSheet`, `DecisionSheet`, `SettingRow`, chips `ChoiceChip`), las mascotas de `designs` en
los estados vacíos (sin solicitudes, sin recurrentes) y los colores/tokens vigentes en claro y oscuro.

## 10. Migraciones propuestas (se preparan como archivos; **no se aplican**)

Todas aditivas, con rollback documentado y una transacción, en este orden:
1. `group_roles_and_join_requests` — `is_group_admin`, `join_mode`, `group_join_requests`, RPC de solicitud/aprobación, ajuste de `join_group`, restricción de crear códigos a admins, nuevos `kind` de `notifications`.
2. `group_visibility_and_archive` — `hidden_at`, `hide/restore_group_for_me`, `archive_group_for_all`, `remove_group_member`, `set_member_role`.
3. `group_kind_hogar` — alias `casa→hogar`, actualización de datos, nueva restricción.
4. `shared_category_otros` — plantilla `otros` (gasto).
5. `notification_prefs_and_push` — preferencias, trigger de push generalizado, textos nuevos, deep link por aviso.
6. `group_contacts_and_invitations` — contactos, invitaciones directas, consentimiento, bloqueo.
7. `group_recurring_expenses` — recurrentes compartidos Fase 1.
(La Fase 2 de recurrentes y los importes personalizados no se incluyen hasta tu aprobación.)

## 11. Plan por etapas y pruebas

| Etapa | Contenido | Migración | Aprobación |
|---|---|---|---|
| G1 | Reemplazar el simulacro de eliminar por ocultar/salir/archivar; «Otros»; Hogar (tipo) | 2, 3, 4 | tu OK a esta propuesta |
| G2 | Roles + solicitudes de ingreso + notificaciones de grupo | 1, 5 | OK de §1–2 |
| G3 | Push de pagos y preferencias | 5 | OK de §6–7 |
| G4 | Contactos e invitaciones directas | 6 | OK de §3 |
| G5 | Recurrentes de Hogar (Fase 1) | 7 | OK de §5 |

Cada etapa: pruebas SQL en PGlite, Vitest, verificación visual y, para push/WhatsApp, prueba en iPhone y Android reales.

## 12. Decisiones que necesito

1. ¿Uno o varios administradores? (recomiendo varios, con mínimo uno)
2. Grupos existentes: ¿`open` (recomendado) o `approval`?
3. «Archivar igual» con deudas pendientes: ¿sí o no?
4. Contactos: ¿invitación con aceptación primero y agregado directo en una fase posterior (recomendado)?
5. Recurrentes: ¿Fase 1 con confirmación de un toque primero (recomendado) y automático después?
6. ¿Aprobás restringir la creación de códigos a administradores?
7. ¿Orden de etapas G1→G5?

## 13. Hallazgos registrados para G5 (corregir en esa etapa)
1. **Editar el nombre del grupo no se guarda en el servidor.** «Editar grupo → Guardar cambios» escribe en un almacén en memoria
   (`patchOverlay`) y muestra «Cambios guardados»; al recargar vuelve el nombre anterior. Debe guardarse de verdad (función del
   servidor, solo administradores) y no mostrar «guardado» antes de la respuesta.
2. **Los gastos recurrentes de Hogar existen solo en memoria** (`overlay.recurring`, lista de ejemplo en «Editar grupo» y «Crear
   grupo»). No hay tabla ni cálculo en el servidor; desaparecen al recargar. Se reemplazan por la Fase 1 de §5.
