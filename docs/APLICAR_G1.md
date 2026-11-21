# Aplicar G1 / G2 en producción (procedimiento preparado — NADA aplicado todavía)

Verificado en solo lectura el 2026-11-21: `20261122` y `20261123` están aplicadas; producción tiene además `20261121`, `20261124`,
`20261125`, `20261125000100` de otra rama (no están en `main`; no tocan grupos). Por eso G1/G2 usan versiones desde `20261126`.
Respaldo y script: `supabase/ops/g1_prod.cjs` (preflight | backup | verify | apply `--lote=A|B`). Respaldos en
`~/Desktop/MONI/backups-g1/` (fuera del repo; datos reales).

## Lote A — ADITIVO, se puede aplicar antes de publicar el front (compatible con la app publicada)
Archivo: `20261126000000_group_hide_archive_additive.sql` · reversión: `ops/group_hide_archive_additive_rollback.sql`
- Agrega `group_members.hidden_at` (nullable, sin valor por defecto).
- Agrega funciones nuevas: `is_group_owner`, `group_open_balance_count`, `hide_group_for_me`, `restore_group_for_me`,
  `archive_group_for_all`, `set_member_role`, `get_my_hidden_and_archived_groups`.
- Recrea `get_my_groups` con UNA columna más al final (`hidden_at`): mismas filas, mismo orden, mismos permisos.
- No cambia ninguna otra función; no cambia `casa`; no toca datos. Probado: la app publicada ve exactamente lo mismo (18 comprobaciones).

## Lote B — reservado para la publicación del front (cambia funciones/datos visibles para la app publicada)
Orden: `20261126000100_group_admin_enforcement` (leave_group con «último administrador»; códigos solo para administradores),
`20261126000200_group_kind_hogar` (Casa→Hogar), `20261126000300_shared_category_otros` (aparece «Otros» también en el onboarding).

## G2 — solicitudes de ingreso (reservado; después del lote B y con el front nuevo)
`20261127000000_group_join_requests.sql` · reversión: `ops/group_join_requests_rollback.sql`.

## Pasos de cada aplicación (cada una necesita tu autorización específica)
1. `preflight --lote=X` → GO.  2. `backup`.  3. `G1_AUTORIZADO=SI apply --lote=X` (transacción por archivo, registro en
`schema_migrations`, huella de saldos antes/después).  4. `verify`.
Reversión: el script `…_rollback.sql` del lote, o `restore_g1.sql` del respaldo. Ninguna toca movimientos, gastos, pagos ni saldos.
