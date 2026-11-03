// Supabase Edge Function (Deno): data and actions for the admin panel (/adminmoni). Thin wiring only; the decisions
// live in lib.ts (unit-tested under Vitest).
//
// Security model:
//   * verify_jwt = true (supabase/config.toml) AND the function re-checks identity itself:
//       1. the user comes from `auth.getUser(jwt)` on a USER-scoped client (never getSession, never the body);
//       2. the email must be confirmed (or a verified Google identity) AND be in ADMIN_EMAILS (comma-separated);
//       3. anything else answers 403 with no data. ADMIN_EMAILS unset / empty means nobody is admin.
//   * The service-role client is created ONLY after step 3 passes.
//   * All reads and writes go through SECURITY DEFINER functions granted to service_role only (migrations
//     20261114000000, 20261119000000, 20261120000000).
//   * Free text written by users is never selected, except the support tickets people write to the team. Push message
//     bodies and support replies are never stored in the audit table or logged.
//   * Suspending needs the typed email, and never targets the asking admin or another admin.
//   * Errors answer a generic code: no stack traces, SQL, keys or endpoints.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { corsHeaders, jsonResponse, readBodyCapped } from '../_shared/http.ts'
import {
  buildPayload,
  plusExpiryMessage,
  sendToAll,
  TTL_SECONDS,
  type PushRequest,
  type PushSubscriptionRow,
} from '../push-send/lib.ts'
import {
  auditSection,
  decideAccess,
  decidePushRateLimit,
  decideSuspension,
  parseAdminRequest,
  parseAllowlist,
  PLUS_NOTIFY_ACTION,
  PLUS_NOTIFY_LIMIT_PER_HOUR,
  PUSH_ACTION,
  PUSH_LIMIT_PER_HOUR,
  PUSH_WINDOW_MS,
  supportReplyPush,
  type AdminRequest,
} from './lib.ts'

const MAX_BODY_BYTES = 8192
const PAGE_SIZE = 1000
/** About a hundred years: the longest ban GoTrue accepts without being "forever". */
const SUSPENSION_BAN = '876000h'

type ServiceClient = ReturnType<typeof createClient>
type Result = { status: number; body: unknown }

const internalError = (): Result => ({ status: 500, body: { error: 'internal_error' } })

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1] ?? null
}

// Reads -------------------------------------------------------------------------------------------------------------

async function readSection(
  admin: ServiceClient,
  request: Extract<AdminRequest, { kind: 'section' }>,
): Promise<Result> {
  if (request.section === 'usuarios') {
    const { data, error } = await admin.rpc('admin_usuarios', {
      p_search: request.search === '' ? null : request.search,
      p_filter: request.filter,
      p_limit: request.limit,
      p_offset: request.offset,
    })
    if (error) {
      console.error('admin-panel: admin_usuarios failed', error.code ?? 'unknown')
      return internalError()
    }
    const rows = (data ?? []) as Array<{ o_total: number; o_user_id: string }>
    // Mark the suspended accounts of this page (one extra call for the page, not one per row).
    let suspended = new Set<string>()
    if (rows.length > 0) {
      const { data: ids, error: idsError } = await admin.rpc('admin_suspended_ids', {
        p_ids: rows.map((row) => row.o_user_id),
      })
      if (idsError) {
        console.error('admin-panel: admin_suspended_ids failed', idsError.code ?? 'unknown')
        return internalError()
      }
      suspended = new Set((ids ?? []) as string[])
    }
    return {
      status: 200,
      body: {
        data: {
          rows: rows.map((row) => ({ ...row, o_suspended: suspended.has(row.o_user_id) })),
          total: rows[0]?.o_total ?? 0,
        },
      },
    }
  }

  if (request.section === 'usuario') {
    const { data, error } = await admin.rpc('admin_usuario', { p_id: request.userId })
    if (error) {
      console.error('admin-panel: admin_usuario failed', error.code ?? 'unknown')
      return internalError()
    }
    if (data === null) return { status: 404, body: { error: 'not_found' } }
    const { data: estado, error: estadoError } = await admin.rpc('admin_usuario_estado', {
      p_id: request.userId,
    })
    if (estadoError) {
      console.error('admin-panel: admin_usuario_estado failed', estadoError.code ?? 'unknown')
      return internalError()
    }
    return { status: 200, body: { data: { ...(data as object), estado } } }
  }

  if (request.section === 'soporte') {
    const { data, error } = await admin.rpc('admin_support_list', {
      p_status: request.status,
      p_limit: request.limit,
      p_offset: request.offset,
    })
    if (error) {
      console.error('admin-panel: admin_support_list failed', error.code ?? 'unknown')
      return internalError()
    }
    const rows = (data ?? []) as Array<{ o_total: number }>
    return { status: 200, body: { data: { rows, total: rows[0]?.o_total ?? 0 } } }
  }

  if (request.section === 'soporte_ticket') {
    const { data, error } = await admin.rpc('admin_support_get', { p_id: request.ticketId })
    if (error) {
      console.error('admin-panel: admin_support_get failed', error.code ?? 'unknown')
      return internalError()
    }
    if (data === null) return { status: 404, body: { error: 'not_found' } }
    return { status: 200, body: { data } }
  }

  if (request.section === 'plus_vencen') {
    const { data, error } = await admin.rpc('admin_plus_expiring', { p_days: request.days })
    if (error) {
      console.error('admin-panel: admin_plus_expiring failed', error.code ?? 'unknown')
      return internalError()
    }
    return { status: 200, body: { data } }
  }

  const fn = {
    resumen: 'admin_resumen',
    plus: 'admin_plus',
    ia: 'admin_ia',
    mp: 'admin_mp',
    sistema: 'admin_sistema',
    avisos: 'admin_avisos',
  }[request.section]
  const { data, error } = await admin.rpc(fn)
  if (error) {
    console.error(`admin-panel: ${fn} failed`, error.code ?? 'unknown')
    return internalError()
  }
  return { status: 200, body: { data } }
}

// Push delivery (shared by the owner message, the Plus notice and the support reply) ------------------------------

interface VapidConfig {
  subject: string
  publicKey: string
  privateKey: string
}

function readVapid(): VapidConfig | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT')
  if (!publicKey || !privateKey || !subject?.startsWith('mailto:')) {
    console.error('admin-panel: missing VAPID configuration')
    return null
  }
  return { subject, publicKey, privateKey }
}

async function loadUserSubscriptions(
  admin: ServiceClient,
  userId: string,
): Promise<PushSubscriptionRow[] | null> {
  const subscriptions: PushSubscriptionRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('admin-panel: could not load subscriptions')
      return null
    }
    subscriptions.push(...(data as PushSubscriptionRow[]))
    if (data.length < PAGE_SIZE) break
  }
  return subscriptions
}

type Slot = { ok: true; id: number } | { ok: false; result: Result }

/** Rate limit per admin and action (sliding window from the audit table), then reserves the slot BEFORE sending. */
async function claimSlot(
  admin: ServiceClient,
  adminEmail: string,
  action: string,
  max: number,
  targetUserId: string,
): Promise<Slot> {
  const since = new Date(Date.now() - PUSH_WINDOW_MS).toISOString()
  const { data: recent, error: recentError } = await admin
    .from('admin_acciones')
    .select('created_at')
    .eq('admin_email', adminEmail)
    .eq('action', action)
    .gte('created_at', since)
  if (recentError) {
    console.error('admin-panel: could not read the rate limit')
    return { ok: false, result: internalError() }
  }
  const decision = decidePushRateLimit(
    (recent ?? []).map((row) => (row as { created_at: string }).created_at),
    new Date(),
    max,
  )
  if (!decision.allowed) {
    return {
      ok: false,
      result: {
        status: 429,
        body: { error: 'rate_limited', retry_after_seconds: decision.retryAfterSeconds },
      },
    }
  }
  const { data: reserved, error: reserveError } = await admin
    .from('admin_acciones')
    .insert({ admin_email: adminEmail, action, target_user_id: targetUserId })
    .select('id')
    .single()
  if (reserveError || !reserved) {
    console.error('admin-panel: could not record the action')
    return { ok: false, result: internalError() }
  }
  return { ok: true, id: (reserved as { id: number }).id }
}

interface Delivery {
  recipients: number
  sent: number
  failed: number
  removed: number
}

async function deliver(
  admin: ServiceClient,
  vapid: VapidConfig,
  subscriptions: PushSubscriptionRow[],
  message: PushRequest,
  slotId: number | null,
): Promise<Delivery> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const payload = JSON.stringify(buildPayload(message))
  const outcome = await sendToAll(subscriptions, (s) =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload,
      { TTL: TTL_SECONDS },
    ),
  )
  if (outcome.removedIds.length > 0) {
    const { error } = await admin.from('push_subscriptions').delete().in('id', outcome.removedIds)
    if (error) console.error('admin-panel: could not prune dead subscriptions')
  }
  if (slotId !== null) {
    const { error } = await admin
      .from('admin_acciones')
      .update({ sent_count: outcome.sent, failed_count: outcome.failed })
      .eq('id', slotId)
    if (error) console.error('admin-panel: could not record the result')
  }
  return {
    recipients: subscriptions.length,
    sent: outcome.sent,
    failed: outcome.failed,
    removed: outcome.removedIds.length,
  }
}

/** One audit row for an action that is not a push (no counts, no text). Best effort: the action already happened. */
async function audit(
  admin: ServiceClient,
  adminEmail: string,
  action: string,
  targetUserId: string | null,
): Promise<void> {
  const { error } = await admin
    .from('admin_acciones')
    .insert({ admin_email: adminEmail, action, target_user_id: targetUserId })
  if (error) console.error('admin-panel: could not record the action')
}

// Actions -----------------------------------------------------------------------------------------------------------

async function sendPush(
  admin: ServiceClient,
  adminEmail: string,
  request: Extract<AdminRequest, { kind: 'push' }>,
): Promise<Result> {
  const push = request.push
  const userId = push.userId
  if (!userId) return { status: 400, body: { error: 'invalid_request' } }

  const vapid = readVapid()
  if (!vapid) return { status: 500, body: { error: 'server_misconfigured' } }

  const { data: found, error: userError } = await admin.auth.admin.getUserById(userId)
  if (userError || !found.user) return { status: 404, body: { error: 'not_found' } }

  const subscriptions = await loadUserSubscriptions(admin, userId)
  if (subscriptions === null) return internalError()
  if (subscriptions.length === 0) {
    return { status: 200, body: { recipients: 0, sent: 0, failed: 0, removed: 0 } }
  }

  const slot = await claimSlot(admin, adminEmail, PUSH_ACTION, PUSH_LIMIT_PER_HOUR, userId)
  if (!slot.ok) return slot.result
  return { status: 200, body: await deliver(admin, vapid, subscriptions, push, slot.id) }
}

async function notifyPlusExpiry(
  admin: ServiceClient,
  adminEmail: string,
  request: Extract<AdminRequest, { kind: 'plus_notify' }>,
): Promise<Result> {
  const vapid = readVapid()
  if (!vapid) return { status: 500, body: { error: 'server_misconfigured' } }

  // Only a person whose Plus really ends (no authorized subscription) can be told.
  const { data: expiring, error: expiringError } = await admin.rpc('admin_plus_expiring', {
    p_days: 30,
  })
  if (expiringError) {
    console.error('admin-panel: admin_plus_expiring failed', expiringError.code ?? 'unknown')
    return internalError()
  }
  const rows = ((expiring as { rows?: unknown[] } | null)?.rows ?? []) as Array<{
    user_id: string
    expires_at: string
    days_left: number
  }>
  const row = rows.find((item) => item.user_id === request.userId)
  if (!row) return { status: 404, body: { error: 'not_expiring' } }

  const subscriptions = await loadUserSubscriptions(admin, request.userId)
  if (subscriptions === null) return internalError()
  if (subscriptions.length === 0) {
    return { status: 200, body: { recipients: 0, sent: 0, failed: 0, removed: 0 } }
  }

  const slot = await claimSlot(
    admin,
    adminEmail,
    PLUS_NOTIFY_ACTION,
    PLUS_NOTIFY_LIMIT_PER_HOUR,
    request.userId,
  )
  if (!slot.ok) return slot.result

  const { data: isNew, error: noticeError } = await admin.rpc('record_plus_expiry_notice', {
    p_user: request.userId,
    p_expires_at: row.expires_at,
    p_level: row.days_left,
    p_source: 'admin',
  })
  if (noticeError) {
    console.error('admin-panel: record_plus_expiry_notice failed', noticeError.code ?? 'unknown')
    return internalError()
  }
  if (isNew !== true) return { status: 409, body: { error: 'already_notified' } }

  const message = plusExpiryMessage(row.days_left)
  const push: PushRequest = {
    kind: message.kind,
    title: message.title,
    body: message.body,
    url: message.url,
    audience: 'user',
    userId: request.userId,
    dryRun: false,
  }
  return { status: 200, body: await deliver(admin, vapid, subscriptions, push, slot.id) }
}

async function suspendUser(
  admin: ServiceClient,
  adminEmail: string,
  allowlist: readonly string[],
  request: Extract<AdminRequest, { kind: 'suspend' }>,
): Promise<Result> {
  const { data: found, error: userError } = await admin.auth.admin.getUserById(request.userId)
  if (userError || !found.user) return { status: 404, body: { error: 'not_found' } }

  const decision = decideSuspension({
    adminEmail,
    targetEmail: found.user.email,
    confirmEmail: request.confirmEmail,
    allowlist,
  })
  if (!decision.ok) return { status: 400, body: { error: 'not_allowed', reason: decision.reason } }

  // 1) Block new sign-ins and token refreshes at the auth layer. 2) Record the reason and close every session.
  const { error: banError } = await admin.auth.admin.updateUserById(request.userId, {
    ban_duration: SUSPENSION_BAN,
  })
  if (banError) {
    console.error('admin-panel: could not ban the user')
    return internalError()
  }
  const { error: applyError } = await admin.rpc('admin_apply_suspension', {
    p_user: request.userId,
    p_reason: request.reason,
    p_admin: adminEmail,
  })
  if (applyError) {
    console.error('admin-panel: admin_apply_suspension failed', applyError.code ?? 'unknown')
    return internalError()
  }
  await audit(admin, adminEmail, 'suspend_user', request.userId)
  return { status: 200, body: { suspended: true } }
}

async function unsuspendUser(
  admin: ServiceClient,
  adminEmail: string,
  request: Extract<AdminRequest, { kind: 'unsuspend' }>,
): Promise<Result> {
  const { data: found, error: userError } = await admin.auth.admin.getUserById(request.userId)
  if (userError || !found.user) return { status: 404, body: { error: 'not_found' } }

  // Lift the ban first: if it fails the person stays suspended in both places.
  const { error: banError } = await admin.auth.admin.updateUserById(request.userId, {
    ban_duration: 'none',
  })
  if (banError) {
    console.error('admin-panel: could not lift the ban')
    return internalError()
  }
  const { error: liftError } = await admin.rpc('admin_lift_suspension', { p_user: request.userId })
  if (liftError) {
    console.error('admin-panel: admin_lift_suspension failed', liftError.code ?? 'unknown')
    return internalError()
  }
  await audit(admin, adminEmail, 'unsuspend_user', request.userId)
  return { status: 200, body: { suspended: false } }
}

async function replyToTicket(
  admin: ServiceClient,
  adminEmail: string,
  request: Extract<AdminRequest, { kind: 'support_reply' }>,
): Promise<Result> {
  const { data, error } = await admin.rpc('admin_support_reply', {
    p_id: request.ticketId,
    p_reply: request.reply,
    p_admin: adminEmail,
    p_resolve: request.resolve,
  })
  if (error) {
    if (error.code === 'P0002') return { status: 404, body: { error: 'not_found' } }
    console.error('admin-panel: admin_support_reply failed', error.code ?? 'unknown')
    return internalError()
  }
  const userId = data as string
  await audit(admin, adminEmail, 'support_reply', userId)

  // Best effort: the answer is saved; the push only tells the person it is there (never the text).
  let delivery: Delivery = { recipients: 0, sent: 0, failed: 0, removed: 0 }
  const vapid = readVapid()
  const subscriptions = vapid ? await loadUserSubscriptions(admin, userId) : null
  if (vapid && subscriptions && subscriptions.length > 0) {
    try {
      delivery = await deliver(admin, vapid, subscriptions, supportReplyPush(userId), null)
    } catch {
      console.error('admin-panel: could not send the support push')
    }
  }
  return { status: 200, body: { replied: true, push: delivery } }
}

async function changeTicketStatus(
  admin: ServiceClient,
  adminEmail: string,
  request: Extract<AdminRequest, { kind: 'support_status' }>,
): Promise<Result> {
  const { data, error } = await admin.rpc('admin_support_set_status', {
    p_id: request.ticketId,
    p_status: request.status,
  })
  if (error) {
    if (error.code === 'P0002') return { status: 404, body: { error: 'not_found' } }
    console.error('admin-panel: admin_support_set_status failed', error.code ?? 'unknown')
    return internalError()
  }
  await audit(admin, adminEmail, 'support_status', data as string)
  return { status: 200, body: { status: request.status } }
}

async function setSetting(
  admin: ServiceClient,
  adminEmail: string,
  request: Extract<AdminRequest, { kind: 'setting' }>,
): Promise<Result> {
  const { error } = await admin.rpc('admin_set_setting', {
    p_key: request.key,
    p_enabled: request.enabled,
    p_admin: adminEmail,
  })
  if (error) {
    console.error('admin-panel: admin_set_setting failed', error.code ?? 'unknown')
    return internalError()
  }
  await audit(admin, adminEmail, 'setting_set', null)
  return { status: 200, body: { key: request.key, enabled: request.enabled } }
}

async function run(
  admin: ServiceClient,
  adminEmail: string,
  allowlist: readonly string[],
  request: AdminRequest,
): Promise<Result> {
  switch (request.kind) {
    case 'section':
      return readSection(admin, request)
    case 'push':
      return sendPush(admin, adminEmail, request)
    case 'plus_notify':
      return notifyPlusExpiry(admin, adminEmail, request)
    case 'suspend':
      return suspendUser(admin, adminEmail, allowlist, request)
    case 'unsuspend':
      return unsuspendUser(admin, adminEmail, request)
    case 'support_reply':
      return replyToTicket(admin, adminEmail, request)
    case 'support_status':
      return changeTicketStatus(admin, adminEmail, request)
    case 'setting':
      return setSetting(admin, adminEmail, request)
  }
}

async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    console.error('admin-panel: missing environment configuration')
    return jsonResponse(500, { error: 'internal_error' }, origin)
  }

  // 1. Identity: the user the JWT resolves to, verified by the auth server.
  const token = bearerToken(req)
  if (!token) return jsonResponse(401, { error: 'unauthorized' }, origin)
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  if (userError || !userData.user) return jsonResponse(401, { error: 'unauthorized' }, origin)

  // 2. Access decision. Unset ADMIN_EMAILS parses to an empty list: nobody is admin, and it is never a 500.
  const allowlist = parseAllowlist(Deno.env.get('ADMIN_EMAILS'))
  const decision = decideAccess(userData.user, allowlist)
  if (!decision.ok)
    return jsonResponse(403, { error: 'forbidden', reason: decision.reason }, origin)

  // 3. Only now: the request and the privileged client.
  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return jsonResponse(413, { error: 'invalid_request' }, origin)
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'invalid_request' }, origin)
  }
  const parsed = parseAdminRequest(json)
  if (!parsed.ok)
    return jsonResponse(400, { error: 'invalid_request', reason: parsed.reason }, origin)

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey) {
    console.error('admin-panel: missing environment configuration')
    return jsonResponse(500, { error: 'internal_error' }, origin)
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Best-effort access log: a failure here never blocks the panel.
  const { error: auditError } = await admin
    .from('admin_accesos')
    .insert({ admin_email: decision.email, section: auditSection(parsed.value) })
  if (auditError) console.error('admin-panel: could not record the access')

  const result = await run(admin, decision.email, allowlist, parsed.value)
  return jsonResponse(result.status, result.body, origin)
}

Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch {
    console.error('admin-panel: unexpected error')
    return jsonResponse(500, { error: 'internal_error' }, null)
  }
})
