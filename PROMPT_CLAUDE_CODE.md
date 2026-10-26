# PROMPT INICIAL — MONI MVP

Actuá como arquitecto de software, desarrollador full-stack senior, especialista en Supabase, UX engineer y application security engineer.

## Contexto
Estoy desarrollando **Moni**, una app de control de gastos personales. Las pantallas y la identidad visual ya fueron diseñadas en Claude Design y deben ser la fuente de verdad visual. La mascota es un gato de la fortuna con una moneda dorada con `$`. **No rediseñes la aplicación ni el avatar**. Tu trabajo es convertir las pantallas existentes en una aplicación real.

En este repositorio adjunto documentación en:
- `docs/MVP_SCOPE.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `.env.example`
- `netlify.toml.example`

Leé estos archivos completos antes de comenzar. Si alguna pantalla o asset no está disponible, indicá exactamente qué falta; no inventes contenido.

## Stack objetivo
React + TypeScript + Vite, Tailwind CSS, shadcn/ui cuando corresponda, React Router, TanStack Query, React Hook Form + Zod, Supabase PostgreSQL + Auth con Google OAuth + RLS, GitHub y Netlify. Reutilizá el stack existente si es compatible y justificá cambios.

## Alcance estricto del MVP
1. Google OAuth, perfil y rutas privadas.
2. Dashboard con saldo, ingresos, gastos y movimientos reales.
3. CRUD de ingresos y gastos con categorías y filtros.
4. Billeteras/cuentas con saldos correctos y transferencias.
5. Categorías iniciales y personalizadas.
6. Grupos de gastos compartidos, invitaciones, divisiones, balances y compensaciones.
7. Integración discreta del avatar existente.

**No implementar ahora:** tarjetas, cuotas, presupuestos, gastos hormiga, voz, metas de ahorro, sincronización bancaria ni funcionalidades de IA.

## Requisitos no negociables
- No utilizar mocks como sustituto de datos reales en funcionalidades terminadas.
- Todas las tablas expuestas deben contar con RLS probado; aislar datos privados y controlar membresías compartidas.
- No exponer claves privilegiadas de Supabase en frontend.
- Los importes se almacenan con precisión decimal y las operaciones que modifican varios registros deben ser atómicas.
- Transferencias no cuentan como ingresos/gastos; gastos compartidos no deben duplicar contabilidad personal.
- Evitar duplicaciones de rutas, menús y componentes.
- Respetar el diseño existente y priorizar mobile-first.
- Usar migraciones SQL versionadas, tests y validaciones.
- No sobrescribir archivos ni desplegar a producción sin aprobación.

## PRIMERA TAREA — SOLO DIAGNÓSTICO
**No escribas ni modifiques código de la aplicación todavía.**

1. Inspeccioná el repositorio completo y detectá el framework, dependencias, pantallas, componentes, assets y rutas existentes.
2. Creá un inventario de pantallas y una matriz `pantalla -> acción -> datos -> implementación actual -> pendiente`.
3. Mostrá el mapa de navegación en Mermaid e identificá pantallas faltantes, duplicaciones y botones sin comportamiento.
4. Proponé cómo reutilizar cada pantalla de Claude Design sin cambiar la identidad visual.
5. Presentá el modelo de datos y relaciones para Supabase, incluyendo decisiones para saldos, transferencias y compartidos.
6. Describí las políticas RLS necesarias y los escenarios de pruebas de acceso cruzado.
7. Proponé estructura de carpetas, plan por sprints y orden de implementación.
8. Indicá exactamente qué accesos/configuraciones necesito aportar (Supabase, OAuth Google, Netlify), sin solicitar que pegue secretos en el chat.
9. Señalá riesgos, dudas y decisiones que requieren mi aprobación.

**Entregable de esta ejecución:** informe de diagnóstico y plan detallado en tu respuesta. No hacer commits, cambios, migraciones ni deploy. Al final preguntame si apruebo comenzar el Sprint 1.
