# Moni — Plan de implementación

## Sprint 0 — Diagnóstico (sin modificar código)
- Revisar stack y estructura existentes.
- Inventario de pantallas, componentes, assets y flujos.
- Mapa Mermaid de navegación y matriz pantalla/función/datos.
- Propuesta de arquitectura, esquema SQL, políticas RLS y riesgos.
- Presentar plan y pedir aprobación.

## Sprint 1 — Fundaciones
- Configuración TypeScript, rutas y estilos sin romper pantallas.
- Supabase Auth con Google, perfil y rutas protegidas.
- Configuración local de variables y pruebas básicas.

## Sprint 2 — Núcleo financiero
- Cuentas, categorías, ingresos, gastos y transferencias.
- Migraciones versionadas, RLS y pruebas de saldos.

## Sprint 3 — Dashboard
- Métricas reales, filtros y visualización de movimientos.
- Estados vacíos, carga, errores y responsive.

## Sprint 4 — Compartidos
- Invitaciones, grupos, división, deudas y compensaciones.
- Pruebas de cálculos y autorización entre usuarios.

## Sprint 5 — Calidad y publicación
- Integración del gato y accesibilidad.
- E2E de flujos principales, hardening y deploy a Netlify previa aprobación.

## Definición de terminado
Cada sprint entrega: cambios documentados, compilación sin errores, pruebas relevantes pasando, verificación manual, pendientes y riesgos, sin mock data persistente.
