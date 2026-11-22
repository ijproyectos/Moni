#!/usr/bin/env node
// G1 · Procedimiento controlado sobre la base de PRODUCCIÓN. Modos:
//
//   node supabase/ops/g1_prod.cjs preflight [--lote=A|B]   SOLO LECTURA: ¿se puede aplicar ese lote sin conflictos? (GO / NO-GO)
//   node supabase/ops/g1_prod.cjs backup      SOLO LECTURA: respaldo recuperable + huella de saldos y datos (carpeta FUERA del repo)
//   node supabase/ops/g1_prod.cjs verify      SOLO LECTURA: compara el estado actual con el respaldo (nada se perdió)
//   G1_AUTORIZADO=SI node supabase/ops/g1_prod.cjs apply --lote=A   APLICA el lote (solo con autorización explícita)
//
// La conexión sale de SUPABASE_DB_URL (archivo local .env.db, nunca versionado); la URL no se imprime. Hace falta el paquete `pg`
// (npm i pg en una carpeta temporal y NODE_PATH=<esa carpeta>/node_modules). Los modos de solo lectura usan una transacción READ ONLY.
// `apply` exige: variable G1_AUTORIZADO=SI, preflight en GO, un respaldo de las últimas 24 h y cada migración en su transacción;
// al terminar compara la huella y registra las migraciones en supabase_migrations.schema_migrations.

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { Client } = require('pg')

const ROOT = path.resolve(__dirname, '..', '..')
// Lote A: ADITIVO, compatible con la app publicada (se puede aplicar antes de publicar el front).
// Lote B: cambia funciones existentes / datos visibles: solo junto con la publicación del front nuevo (y después del lote A).
const BATCHES = {
  A: [['20261129000000', 'group_hide_archive_additive']],
  B: [
    ['20261129000100', 'group_admin_enforcement'],
    ['20261129000200', 'group_kind_hogar'],
    ['20261129000300', 'shared_category_otros'],
  ],
  // G2 (solicitudes de ingreso): después del lote B y junto con el front nuevo.
  C: [['20261130000000', 'group_join_requests']],
  // G3 (personas de Moni e invitaciones directas): después de G2 y junto con el front nuevo.
  D: [['20261130000100', 'group_contacts_invitations']],
  // G4 (pagos y avisos de grupos): después de G3 y junto con el front nuevo.
  E: [['20261130000200', 'group_payment_notices']],
  // G5 (nombre del grupo y gastos recurrentes de Hogar): después de G4 y junto con el front nuevo.
  F: [['20261130000300', 'group_recurring_expenses']],
  // G (aviso de grupo eliminado, quitar archivados de la lista y categoría «Ropa»): después de F y junto con el front nuevo.
  G: [['20261201000000', 'group_archived_notice']],
}
const batchArg = (process.argv.find((a) => a.startsWith('--lote=')) || '--lote=A').split('=')[1].toUpperCase()
if (!BATCHES[batchArg]) throw new Error('Lote inválido: usar --lote=A, B, C, D, E, F o G')
const MIGRATIONS = BATCHES[batchArg]
const BACKUP_BASE = process.env.G1_BACKUP_DIR || path.join(os.homedir(), 'Desktop', 'MONI', 'backups-g1')
// Funciones que el lote reemplaza (A: solo get_my_groups; B: las demás) y cuyo cuerpo actual debe coincidir con el repositorio.
const REPLACED = { A: ['get_my_groups'], B: ['create_group', 'leave_group', 'create_group_invite', 'revoke_group_invite'], C: [], D: [], E: [], F: [], G: [] }
const FUNCTIONS = ['create_group', 'leave_group', 'create_group_invite', 'revoke_group_invite', 'get_my_groups', 'join_group']
// Cuerpos de las funciones que G1 reemplaza, tal como están en el repositorio (para detectar cambios en producción).
const EXPECTED = {
  create_group: ['20261106000000_moni_plus.sql'],
  leave_group: ['20261027000000_shared_expenses.sql'],
  create_group_invite: ['20261105000000_shorter_invite_codes.sql'],
  revoke_group_invite: ['20261027000000_shared_expenses.sql'],
  get_my_groups: ['20261027000000_shared_expenses.sql'],
  join_group: ['20261105000000_shorter_invite_codes.sql'],
}

function dbUrl() {
  const text = fs.readFileSync(path.join(ROOT, '.env.db'), 'utf8')
  const m = text.match(/SUPABASE_DB_URL=(.*)/)
  if (!m) throw new Error('Falta SUPABASE_DB_URL en .env.db')
  return m[1].trim().replace(/^["']|["']$/g, '')
}
async function connect() {
  const c = new Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } })
  await c.connect()
  return c
}
const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const bodyOf = (def) => (def.match(/\$function\$([\s\S]*?)\$function\$/) || def.match(/\$\$([\s\S]*?)\$\$/) || [, ''])[1]
function repoBody(file, fn) {
  const t = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', file), 'utf8')
  const re = new RegExp('create or replace function public\\.' + fn + '\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;', 'g')
  let m
  let last = null
  while ((m = re.exec(t))) last = m[1]
  return last
}
const q = async (c, sql, params) => (await c.query(sql, params)).rows

// ---------------------------------------------------------------------------------------------- huella de datos
const TABLES = {
  // tabla: columnas que G1 NO modifica (se comparan antes y después)
  groups: 'id, name, currency, created_by, archived_at, created_at',
  group_members: 'group_id, user_id, role, joined_at, left_at',
  group_invites: 'id, group_id, code, created_by, expires_at, max_uses, uses, revoked_at, created_at',
  shared_expenses: '*',
  shared_expense_splits: '*',
  settlements: '*',
  group_guests: '*',
  group_guest_expenses: '*',
  group_guest_expense_parts: '*',
  group_guest_settlements: '*',
  payment_reports: '*',
  notifications: '*',
  transactions: '*',
  accounts: '*',
}
async function snapshot(c) {
  const out = { takenAt: new Date().toISOString(), tables: {}, kinds: {}, balances: {}, myGroupsNets: null }
  for (const [t, cols] of Object.entries(TABLES)) {
    try {
      const sel = cols === '*' ? 't.*' : cols.split(',').map((x) => 't.' + x.trim()).join(', ')
      const r = await q(c, `select count(*)::int n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') h
                            from (select ${sel} from public.${t} t) x`)
      out.tables[t] = { rows: r[0].n, hash: r[0].h }
    } catch (e) {
      out.tables[t] = { error: String(e.message).slice(0, 80) }
    }
  }
  out.kinds = Object.fromEntries((await q(c, 'select kind, count(*)::int n from public.groups group by kind')).map((r) => [r.kind, r.n]))
  // Saldo de cada persona en cada grupo (la misma función que usa la app) y total por grupo.
  const groups = await q(c, 'select id from public.groups order by id')
  const lines = []
  for (const g of groups) {
    for (const r of await q(c, 'select user_id, net from public.group_balance_rows($1) order by user_id', [g.id])) {
      lines.push(`${g.id}|${r.user_id}|${r.net}`)
    }
  }
  out.balances = { lines: lines.length, hash: crypto.createHash('md5').update(lines.join('\n')).digest('hex') }
  return out
}
function compare(before, after) {
  const problems = []
  for (const t of Object.keys(before.tables)) {
    const a = before.tables[t]
    const b = after.tables[t]
    if (a.error || b.error) continue
    if (a.rows !== b.rows) problems.push(`${t}: filas ${a.rows} → ${b.rows}`)
    else if (a.hash !== b.hash) problems.push(`${t}: contenido distinto`)
  }
  if (before.balances.hash !== after.balances.hash) problems.push('saldos por grupo/persona distintos')
  const total = (k) => Object.values(k).reduce((x, y) => x + y, 0)
  if (total(before.kinds) !== total(after.kinds)) problems.push('cantidad de grupos distinta')
  return problems
}

// ---------------------------------------------------------------------------------------------- preflight
async function preflight(c) {
  const issues = []
  const notes = []
  const versions = (await q(c, 'select version from supabase_migrations.schema_migrations')).map((r) => r.version)
  for (const [v] of MIGRATIONS) if (versions.includes(v)) issues.push(`la versión ${v} ya está registrada en producción`)
  const maxV = versions.sort().pop()
  notes.push(`última versión registrada: ${maxV}`)
  if (maxV >= MIGRATIONS[0][0]) issues.push(`hay versiones posteriores a ${MIGRATIONS[0][0]}`)
  for (const [v, n] of [['20261122000000', 'payment_reports_accounts'], ['20261123000000', 'debt_reminder_push']]) {
    if (!versions.includes(v)) issues.push(`falta la migración previa ${v} ${n}`)
  }
  const has = async (sql) => (await q(c, sql))[0].x
  const hiddenExists = await has("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='group_members' and column_name='hidden_at') x")
  const newFns = ['hide_group_for_me', 'archive_group_for_all', 'set_member_role', 'is_group_owner', 'group_open_balance_count', 'get_my_hidden_and_archived_groups']
  const fnExists = async (fn) => has(`select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${fn}') x`)
  if (batchArg === 'C') {
    if (!(await has("select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_group_owner') x"))) issues.push('falta el lote A')
    if (!(await has("select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_group_invite' and p.prosrc ilike '%not_group_admin%') x"))) issues.push('falta el lote B (códigos solo para administradores)')
    if (await has("select exists(select 1 from information_schema.tables where table_schema='public' and table_name='group_join_requests') x")) issues.push('group_join_requests ya existe')
    if (await has("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='group_invites' and column_name='requires_approval') x")) issues.push('requires_approval ya existe')
    const defsC = await q(c, "select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='join_group'")
    const expJ = repoBody('20261105000000_shorter_invite_codes.sql', 'join_group')
    if (defsC.length !== 1 || !expJ || norm(bodyOf(defsC[0].d)) !== norm(expJ)) issues.push('join_group: la definición de producción difiere del repositorio')
  } else if (batchArg === 'F') {
    if (!(await has("select exists(select 1 from information_schema.tables where table_schema='public' and table_name='notification_prefs') x"))) issues.push('falta G4 (notification_prefs)')
    if (!(await has("select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='clean_push_text') x"))) issues.push('falta G4 (private.clean_push_text)')
    if (!(await has("select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fixed_expense_due_on') x"))) issues.push('falta public.fixed_expense_due_on')
    if (await has("select exists(select 1 from information_schema.tables where table_schema='public' and table_name='group_recurring_expenses') x")) issues.push('group_recurring_expenses ya existe')
    if (!(await has("select exists(select 1 from public.category_templates where slug='otros') x"))) issues.push("falta la plantilla 'otros' (lote B): el atajo «Otro gasto» la usa")
  } else if (batchArg === 'E') {
    if (!(await has("select exists(select 1 from information_schema.tables where table_schema='public' and table_name='group_invitations') x"))) issues.push('falta G3 (group_invitations)')
    if (await has("select exists(select 1 from information_schema.tables where table_schema='public' and table_name='notification_prefs') x")) issues.push('notification_prefs ya existe')
    // El índice único de avisos por pago no puede crearse si ya hay avisos repetidos de un mismo pago.
    const dup = await q(c, "select count(*)::int n from (select report_id, kind from public.notifications where report_id is not null and kind in ('payment_reported','payment_confirmed','payment_rejected') group by 1, 2 having count(*) > 1) t")
    if (dup[0].n > 0) issues.push('hay avisos de pago repetidos (el índice único fallaría)')
  } else if (batchArg === 'D') {
    if (!(await has("select exists(select 1 from information_schema.tables where table_schema='public' and table_name='group_join_requests') x"))) issues.push('falta G2 (group_join_requests)')
    for (const t of ['contact_prefs', 'group_invitations']) {
      if (await has(`select exists(select 1 from information_schema.tables where table_schema='public' and table_name='${t}') x`)) issues.push(`${t} ya existe`)
    }
  } else if (batchArg === 'G') {
    if (!(await has("select exists(select 1 from information_schema.tables where table_schema='public' and table_name='group_recurring_expenses') x"))) issues.push('falta G5 (group_recurring_expenses)')
    if (await has("select exists(select 1 from public.category_templates where slug='ropa') x")) issues.push("la plantilla 'ropa' ya existe")
    const kindDef = await q(c, "select pg_get_constraintdef(oid) d from pg_constraint where conname='notifications_kind_check'")
    if (kindDef.length !== 1 || /group_archived/.test(kindDef[0].d)) issues.push('notifications_kind_check no es el esperado')
    for (const fn of ['archive_group_for_all', 'get_my_hidden_and_archived_groups']) {
      const defs = await q(c, "select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1", [fn])
      const expected = repoBody('20261129000000_group_hide_archive_additive.sql', fn)
      if (defs.length !== 1) issues.push(`${fn}: hay ${defs.length} definiciones`)
      else if (/insert into public\.notifications/i.test(defs[0].d) || (fn === 'archive_group_for_all' && (!expected || norm(bodyOf(defs[0].d)) !== norm(expected)))) issues.push(`${fn}: la definición de producción difiere del repositorio`)
    }
  } else if (batchArg === 'A') {
    if (hiddenExists) issues.push('group_members.hidden_at ya existe')
    for (const fn of newFns) if (await fnExists(fn)) issues.push(`la función ${fn} ya existe`)
  } else {
    if (!hiddenExists) issues.push('falta el lote A (group_members.hidden_at)')
    for (const fn of newFns) if (!(await fnExists(fn))) issues.push(`falta el lote A (función ${fn})`)
    if (await has("select exists(select 1 from public.category_templates where slug='otros') x")) issues.push("la plantilla 'otros' ya existe")
    const constraint = await q(c, "select pg_get_constraintdef(oid) d from pg_constraint where conname='groups_kind_check'")
    if (constraint.length !== 1 || !/casa/.test(constraint[0].d)) issues.push('groups_kind_check no es el esperado')
    const policies = (await q(c, "select policyname from pg_policies where schemaname='public' and tablename='group_invites'")).map((r) => r.policyname)
    if (policies.join() !== 'group_invites_select_member') issues.push(`políticas de group_invites inesperadas: ${policies.join() || 'ninguna'}`)
  }
  const deps = (await q(c, "select count(*)::int n from pg_depend d join pg_proc p on p.oid=d.refobjid where p.proname='get_my_groups' and d.deptype='n'"))[0].n
  if (deps !== 0) issues.push('get_my_groups tiene dependencias')
  for (const fn of REPLACED[batchArg]) {
    const defs = await q(c, "select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1", [fn])
    const expected = repoBody(EXPECTED[fn][0], fn)
    if (defs.length !== 1) issues.push(`${fn}: hay ${defs.length} definiciones`)
    else if (!expected || norm(bodyOf(defs[0].d)) !== norm(expected)) issues.push(`${fn}: la definición de producción difiere del repositorio`)
  }
  const noOwner = (await q(c, "select count(*)::int n from public.groups g where not exists (select 1 from public.group_members m where m.group_id=g.id and m.role='owner' and m.left_at is null)"))[0].n
  if (noOwner !== 0) issues.push(`${noOwner} grupo(s) sin administrador activo`)
  const unknownKinds = await q(c, "select distinct kind from public.groups where kind not in ('casa','hogar','viaje','pareja','amigos')")
  if (unknownKinds.length) issues.push('tipos de grupo inesperados')
  for (const [v, n] of MIGRATIONS) {
    const f = path.join(ROOT, 'supabase', 'migrations', `${v}_${n}.sql`)
    if (!fs.existsSync(f)) issues.push(`falta el archivo ${v}_${n}.sql`)
  }
  notes.push(`tipos de grupo hoy: ${JSON.stringify(Object.fromEntries((await q(c, 'select kind, count(*)::int n from public.groups group by kind')).map((r) => [r.kind, r.n])))}`)
  return { issues, notes }
}

// ---------------------------------------------------------------------------------------------- respaldo
async function backup(c) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(BACKUP_BASE, stamp)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const dump = async (name, sql) => {
    const rows = await q(c, sql)
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(rows, null, 1), { mode: 0o600 })
    return rows
  }
  const groups = await dump('data_groups', 'select * from public.groups order by id')
  const members = await dump('data_group_members', 'select * from public.group_members order by group_id, user_id')
  await dump('data_group_invites', 'select * from public.group_invites order by id')
  await dump('data_category_templates', 'select * from public.category_templates order by sort_order, slug')
  await dump('schema_policies', "select * from pg_policies where schemaname='public' and tablename in ('groups','group_members','group_invites') order by tablename, policyname")
  await dump('schema_acls', "select p.proname, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any($1)".replace('$1', "array['" + FUNCTIONS.join("','") + "']"))
  const defs = {}
  for (const fn of FUNCTIONS) defs[fn] = (await q(c, "select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1", [fn]))[0].d
  fs.writeFileSync(path.join(dir, 'schema_functions.json'), JSON.stringify(defs, null, 1), { mode: 0o600 })
  const constraint = (await q(c, "select pg_get_constraintdef(oid) d from pg_constraint where conname='groups_kind_check'"))[0].d
  const snap = await snapshot(c)
  fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify(snap, null, 1), { mode: 0o600 })
  // Script de restauración: deja la base como estaba antes de G1 (sin tocar movimientos, gastos, pagos ni saldos).
  const esc = (s) => String(s).replace(/'/g, "''")
  let sql = `-- Restauración de G1 (generado ${stamp}). Deja funciones, políticas, tipos y roles como estaban ANTES de G1.\n-- Se ejecuta DESPUÉS de los scripts de reversión de supabase/ops (o en su lugar). No toca movimientos, gastos, pagos ni saldos.\nbegin;\n`
  sql += `-- tipos de grupo originales\n`
  for (const g of groups) sql += `update public.groups set kind = '${esc(g.kind)}' where id = '${g.id}';\n`
  sql += `alter table public.groups drop constraint if exists groups_kind_check;\nalter table public.groups add constraint groups_kind_check ${constraint};\n`
  sql += `-- roles originales\n`
  for (const m of members) sql += `update public.group_members set role = '${esc(m.role)}' where group_id = '${m.group_id}' and user_id = '${m.user_id}';\n`
  sql += `-- política de códigos original\ndrop policy if exists "group_invites_select_admin" on public.group_invites;\ndrop policy if exists "group_invites_select_member" on public.group_invites;\n`
  sql += `create policy "group_invites_select_member" on public.group_invites for select to authenticated using (public.is_group_member(group_id));\n`
  sql += `-- funciones originales (get_my_groups cambia de tipo de retorno: se recrea)\ndrop function if exists public.get_my_groups();\n`
  for (const fn of FUNCTIONS) sql += `${defs[fn].trim().replace(/^CREATE OR REPLACE FUNCTION/, fn === 'get_my_groups' ? 'CREATE FUNCTION' : 'CREATE OR REPLACE FUNCTION')};\n`
  sql += `revoke execute on function public.get_my_groups() from public, anon;\ngrant execute on function public.get_my_groups() to authenticated;\n`
  sql += `delete from public.category_templates where slug = 'otros';\n`
  sql += `drop function if exists public.set_member_role(uuid, uuid, text), public.archive_group_for_all(uuid, text), public.restore_group_for_me(uuid), public.hide_group_for_me(uuid), public.get_my_hidden_and_archived_groups(), public.group_open_balance_count(uuid), public.is_group_owner(uuid);\n`
  sql += `alter table public.group_members drop column if exists hidden_at;\ncommit;\n`
  fs.writeFileSync(path.join(dir, 'restore_g1.sql'), sql, { mode: 0o600 })
  fs.writeFileSync(
    path.join(dir, 'LEEME.txt'),
    `Respaldo lógico previo a G1 (${stamp}).\nContiene datos reales: guardalo en un lugar privado y NO lo subas a Git.\n` +
      `- data_*.json: filas completas de groups, group_members, group_invites y category_templates.\n- schema_*.json: funciones, políticas y permisos que G1 reemplaza.\n` +
      `- snapshot.json: huella de todas las tablas financieras y de los saldos por grupo/persona.\n- restore_g1.sql: vuelve al estado previo a G1.\n` +
      `Además conviene confirmar en Supabase (Database → Backups) que existe un respaldo diario/PITR del proyecto.\n`,
  )
  return { dir, snap }
}
function latestBackup() {
  if (!fs.existsSync(BACKUP_BASE)) return null
  const names = fs.readdirSync(BACKUP_BASE).filter((n) => fs.existsSync(path.join(BACKUP_BASE, n, 'snapshot.json'))).sort()
  const name = names.pop()
  return name ? { dir: path.join(BACKUP_BASE, name), name } : null
}

// ---------------------------------------------------------------------------------------------- main
;(async () => {
  const mode = process.argv[2]
  if (mode === 'apply' && !process.argv.some((a) => a.startsWith('--lote='))) throw new Error('apply exige --lote=A o --lote=B')
  if (!['preflight', 'backup', 'verify', 'apply'].includes(mode)) {
    console.log('Uso: g1_prod.cjs preflight | backup | verify | apply')
    process.exit(1)
  }
  const c = await connect()
  try {
    if (mode !== 'apply') await c.query('begin read only')
    if (mode === 'preflight') {
      const { issues, notes } = await preflight(c)
      notes.forEach((n) => console.log('·', n))
      console.log(issues.length ? 'NO-GO:\n - ' + issues.join('\n - ') : 'GO: G1 puede aplicarse sin conflictos con la base actual.')
    } else if (mode === 'backup') {
      const { dir, snap } = await backup(c)
      console.log('Respaldo creado en:', dir)
      console.log('Huella:', JSON.stringify(Object.fromEntries(Object.entries(snap.tables).map(([t, v]) => [t, v.rows ?? 'sin tabla']))))
      console.log('Tipos de grupo:', JSON.stringify(snap.kinds), '· líneas de saldo:', snap.balances.lines)
    } else if (mode === 'verify') {
      const last = latestBackup()
      if (!last) throw new Error('No hay respaldo previo')
      const before = JSON.parse(fs.readFileSync(path.join(last.dir, 'snapshot.json'), 'utf8'))
      const problems = compare(before, await snapshot(c))
      console.log(problems.length ? 'DIFERENCIAS:\n - ' + problems.join('\n - ') : `OK: nada se perdió respecto del respaldo ${last.name}.`)
    } else {
      if (process.env.G1_AUTORIZADO !== 'SI') throw new Error('Falta G1_AUTORIZADO=SI (autorización explícita).')
      const last = latestBackup()
      if (!last || Date.now() - new Date(last.name.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z')).getTime() > 24 * 3600 * 1000) {
        throw new Error('Hace falta un respaldo de las últimas 24 horas (modo backup).')
      }
      await c.query('begin read only')
      const { issues } = await preflight(c)
      await c.query('rollback')
      if (issues.length) throw new Error('Preflight en NO-GO: ' + issues.join('; '))
      // Huella tomada justo antes de aplicar (la actividad normal de la app entre el respaldo y ahora no cuenta como diferencia).
      const before = await snapshot(c)
      for (const [version, name] of MIGRATIONS) {
        const text = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', `${version}_${name}.sql`), 'utf8')
        console.log('Aplicando', version, name, '…')
        try {
          await c.query(text) // cada archivo trae su propio begin/commit
        } catch (e) {
          await c.query('rollback').catch(() => undefined)
          throw new Error(`Falló ${version}: ${e.message} (esa migración se revirtió; las anteriores quedaron aplicadas)`)
        }
        await c.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)', [version, name, [text]])
        console.log('  aplicada y registrada')
      }
      const problems = compare(before, await snapshot(c))
      console.log(problems.length ? 'ATENCIÓN, diferencias tras aplicar:\n - ' + problems.join('\n - ') : 'OK: todas las huellas coinciden (grupos, integrantes, gastos, pagos, saldos).')
      console.log('Tipos de grupo ahora:', JSON.stringify((await q(c, 'select kind, count(*)::int n from public.groups group by kind')).reduce((a, r) => ({ ...a, [r.kind]: r.n }), {})))
    }
  } finally {
    if (mode !== 'apply') await c.query('rollback').catch(() => undefined)
    await c.end()
  }
})().catch((e) => {
  console.error('ERROR:', String(e.message).slice(0, 400))
  process.exit(1)
})
