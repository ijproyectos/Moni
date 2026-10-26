# Moni — Arquitectura técnica propuesta

## Stack
- React + TypeScript (strict) + Vite.
- Tailwind CSS + shadcn/ui, respetando componentes visuales existentes.
- React Router; TanStack Query; React Hook Form + Zod.
- Supabase PostgreSQL, Auth (Google), RLS y Edge Functions solo cuando haga falta lógica privilegiada.
- GitHub y Netlify; PWA como mejora posterior dentro del cierre del MVP si es viable.
- Vitest + React Testing Library; Playwright para flujos críticos.

## Capas
`UI / routes -> feature services & hooks -> Supabase client -> Postgres con RLS`

Los cálculos financieros sensibles y las operaciones multitabla deben realizarse transaccionalmente en PostgreSQL (RPC o funciones seguras, con permisos revisados). No confiar en datos o membresías enviados por el cliente.

## Entidades iniciales (sujetas a validación)
- `profiles` (id = auth.users.id, preferencias).
- `accounts` (owner_id, tipo, moneda, saldo inicial, estado).
- `categories` (owner_id nullable para predeterminadas, tipo).
- `transactions` (owner_id, account_id, category_id, tipo, importe, fecha, estado).
- `transfers` (owner_id, from_account_id, to_account_id, importe, fecha, estado).
- `shared_groups`, `shared_group_members`, `invitations`.
- `shared_expenses`, `shared_expense_splits`, `shared_settlements`.

Diseñar explícitamente la relación entre movimientos personales y gastos compartidos, sin duplicación de saldos. Definir estados, integridad referencial, idempotencia y cancelación antes de crear migraciones.

## Seguridad
- RLS en todas las tablas expuestas; verificar propiedad de cuenta y pertenencia a grupo en cada operación.
- Clave pública/publishable de Supabase en frontend; jamás `service_role` ni secretos OAuth.
- Google OAuth configurado mediante Supabase Auth; registrar URL de callback y URLs de redirección permitidas.
- Validaciones en cliente y servidor; rate limits para invitaciones; expiración de tokens de invitación.
- Separar entornos de desarrollo y producción; no ejecutar migraciones destructivas sin aprobación.
- Probar ataques de acceso cruzado: usuario A no puede leer ni mutar recursos privados de B.

## Estructura sugerida
```
src/
  app/
  components/
  features/{auth,dashboard,accounts,transactions,categories,shared-expenses}/
  lib/
  assets/
supabase/migrations/
docs/
tests/
```

## Integración con diseños
Inspeccionar primero archivos y assets de Claude Design. Documentar rutas, componentes, estados, diseño responsivo, tipografías, tokens y mapa de navegación. No recrear pantallas existentes ni inventar nuevas sin aprobación.
