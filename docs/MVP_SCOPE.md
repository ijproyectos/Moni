# Moni — Alcance del MVP v1.0

## Objetivo
PWA mobile-first para registrar y consultar finanzas personales reales, con datos en Supabase y despliegue en Netlify. Reutilizar las pantallas y la identidad visual ya definidas en Claude Design.

## Funcionalidades incluidas
1. **Autenticación:** Google OAuth vía Supabase Auth, sesión persistente, cierre de sesión, rutas privadas y perfil; moneda inicial ARS.
2. **Dashboard:** saldo disponible agregado, ingresos y gastos mensuales, balance mensual, cinco movimientos recientes y distribución por categoría; siempre datos reales.
3. **Movimientos:** alta, edición, eliminación, listado, búsqueda y filtros por fecha/categoría de ingresos y gastos, asociados a una cuenta.
4. **Billeteras:** efectivo, bancos y billeteras virtuales; saldo inicial y saldo derivado de movimientos; transferencias entre cuentas sin duplicar ingresos/gastos.
5. **Categorías:** categorías predeterminadas y personalizadas, separadas por tipo.
6. **Gastos compartidos:** grupos con miembros invitados, gastos con pagador y participantes, división igual o porcentual, balance neto y compensaciones; controles de membresía.
7. **Mascota:** gato de la fortuna en bienvenida, inicio y estados vacíos; usar assets reales sin rediseñarlo.

## Fuera del MVP (backlog)
- Tarjetas de crédito y cuotas.
- Presupuestos y alertas.
- Gastos hormiga y recomendaciones automáticas.
- Registro de gastos por voz.
- Metas de ahorro.
- Sincronización bancaria automática.
- Conversión multimoneda y cotizaciones.
- Notificaciones push y modo offline de escritura.

## Reglas de negocio
- Almacenar importes con `numeric` en PostgreSQL; definir redondeo y moneda. No usar float para lógica monetaria.
- El saldo de cuenta es saldo inicial más movimientos y transferencias confirmados, calculado de forma consistente.
- Una transferencia no es ingreso ni gasto del usuario.
- Diferenciar el gasto personal de la deuda compartida para evitar doble contabilización.
- Los pagos entre miembros (compensaciones) no duplican el gasto original.
- Evitar borrar en cascada datos financieros; definir archivado/anulación con trazabilidad.
- No sumar saldos de monedas distintas sin conversión explícita; el MVP opera inicialmente en ARS.

## Criterios de aceptación
- [ ] Puedo iniciar sesión con Google y conservar mi sesión.
- [ ] Puedo crear una cuenta con saldo inicial.
- [ ] Un gasto disminuye el saldo de la cuenta correcta.
- [ ] Un ingreso aumenta el saldo de la cuenta correcta.
- [ ] Una transferencia cambia dos saldos sin alterar totales de ingresos/gastos.
- [ ] Puedo editar/anular un movimiento y los saldos se recalculan correctamente.
- [ ] El dashboard muestra métricas calculadas desde Supabase.
- [ ] Puedo filtrar movimientos por período y categoría.
- [ ] Puedo invitar a otra persona a un grupo y registrar un gasto compartido.
- [ ] El cálculo de deudas y compensaciones es correcto y testeado.
- [ ] RLS impide leer o modificar datos ajenos fuera de permisos compartidos.
- [ ] La interfaz es responsive y conserva la estética de las pantallas originales.
- [ ] El proyecto compila, pasa pruebas y puede desplegarse en Netlify.
