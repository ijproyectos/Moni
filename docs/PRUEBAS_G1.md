# Procedimiento de pruebas de G1 (usuarios y grupos de PRUEBA)

**Regla:** nunca con grupos o personas reales. Hacerlo en un entorno de prueba (proyecto Supabase de staging o base local),
con las migraciones `20261126000000`, `20261126000100` y `20261126000200` aplicadas **solo ahí**. Producción no se toca hasta tu autorización.

## 0. Preparación
1. Crear 4 cuentas de prueba: **Ana** (administradora), **Beto** (integrante), **Cami** (integrante), **Dani** (ajena al grupo).
   Ana debe ser Plus (o usar un segundo grupo) porque el plan Free permite un grupo activo creado por persona.
2. Ana crea el grupo **«Prueba Hogar»** (tipo Hogar). Beto y Cami entran con el código. Dani no entra.
3. Cargar un gasto de $900 pagado por Beto, dividido entre Ana, Beto y Cami (Ana y Cami deben $300 a Beto).

## 1. Hogar (antes Casa)
- Crear un grupo y ver que el tipo ofrecido es **Hogar**; el grupo viejo «Casa» (si existe en staging) se ve como Hogar con sus datos.

## 2. Ocultar y restaurar  (Beto)
1. Beto: Editar grupo → **Quitar de mi cuenta** → confirmar. Esperado: el grupo sale de su lista; aparece «Ocultos y archivados (1)».
2. Beto sigue siendo integrante: Ana lo ve en Personas. Los totales «Te deben / Debés» de Beto **siguen contando** el grupo ($600).
3. Cami hace «Ya pagué» a Beto: Beto sigue recibiendo el aviso y puede confirmar/rechazar aunque el grupo esté oculto.
4. Beto: Ocultos y archivados → **Restaurar**. Esperado: vuelve a la lista, sin cambios en saldos.

## 3. Salir
1. Cami (debe $300): Salir del grupo → debe bloquearse con «Saldá las cuentas primero».
2. Cami salda y sale: Esperado, deja de ser integrante; Ana y Beto no cambian.

## 4. Último administrador
1. Ana (única administradora, hay otros integrantes): Salir del grupo → Esperado: error «Sos la única persona administradora…».
2. Ana: Editar grupo → Administradores → **Hacer admin** a Beto. Esperado: Beto figura como administrador.
3. Ana ya puede salir (si no tiene deuda). Con dos administradores, uno puede quitarse el rol; con uno solo, el botón «Quitar» está
   deshabilitado y el servidor rechaza quitarlo.

## 5. Archivar (Eliminar para todos)
1. **Con deudas:** Ana (con el gasto pendiente): Eliminar para todos → escribir el nombre → Esperado: rechazo «Todavía hay deudas
   pendientes»; el grupo sigue activo y la pantalla **no** dice «eliminado».
2. **Con pago sin confirmar:** saldar la deuda con un «Ya pagué» que Beto no confirme → Eliminar para todos → Esperado: rechazo
   «Hay pagos sin confirmar».
3. **Sin deudas:** confirmar/anular todo hasta que los saldos queden en 0 → Eliminar para todos → Esperado: el grupo pasa a
   «Archivado para todos» en «Ocultos y archivados»; el historial se puede ver; no se pueden cargar gastos ni usar códigos.
4. Verificar que los gastos y pagos del grupo **siguen en la base** (no hubo borrado).
5. Con un invitado sin cuenta que debe plata: también debe bloquearse.

## 4b. Permisos de no administradores  (Beto/Cami sin rol, y Dani ajena)
Con el rol de integrante, **ninguna** de estas acciones debe funcionar (ni desde la app ni llamando la función directamente):
- Eliminar para todos → «Solo los administradores…» (no se ve el botón y el servidor lo rechaza).
- Hacer/quitar administrador.
- Dani (ajena): ocultar, archivar o cambiar roles de un grupo que no es suyo → rechazo; no ve gastos ni integrantes.
- Escribir directo en `group_members` (por ejemplo cambiar `hidden_at` de otra persona) → rechazado por permisos.

## 6. Automatizadas (ya corridas por mí)
- `supabase/tests/group_hide_archive_roles.test.sql` (pgTAP, `supabase test db`) — 18 comprobaciones.
- Suite equivalente de 60 comprobaciones sobre la cadena completa de migraciones en una base local (PGlite): todas pasaron.
- Tests de interfaz (Vitest) de Archivar, Ocultar, Administradores, Ocultos y archivados y totales con grupos ocultos.
