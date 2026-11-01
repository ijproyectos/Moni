// Supabase Edge Function (Deno): data and actions for the admin panel (/adminmoni). Thin wiring only; the decisions
// live in lib.ts (unit-tested under Vitest).
//
// Security model:
//   * verify_jwt = true (supabase/config.toml) AND the function re-checks identity itself:
//       1. the user comes from `auth.getUser(jwt)` on a USER-scoped client (never getSession, never the body);
//       2. the email must be confirmed (or a verified Google identity) AND be in ADMIN_EMAILS (comma-separated);
//       3. anything else answers 403 with no data. ADMIN_EMAILS unset / empty means nobody is admin.
//   * The service-role client is created ONLY after step 3 passes.
//   * All reads go through SECURITY DEFINER functions granted to service_role only (migration 20261114000000).
//   * Free text written by users is never selected. Push message bodies are never stored or logged.
//   * Errors answer a generic code: no stack traces, SQL, keys or endpoints.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { corsHeaders, jsonResponse, readBodyCapped } from '../_shared/http.ts'
import { buildPayload, sendToAll, TTL_SECONDS, type PushSubscriptionRow } from '../push-send/lib.ts'
import {
  auditSection,
  decideAccess,
  decidePushRateLimit,
  parseAdminRequest,
  parseAllowlist,
  PUSH_ACTION,
  PUSH_WINDOW_MS,
  type AdminRequest,
} from './lib.ts'

const MAX_BODY_BYTES = 4096
const PAGE_SIZE = 1000

type ServiceClient = ReturnType<typeof createClient>

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1] ?? null
}

async function readSection(
  admin: ServiceClient,
  request: Extract<AdminRequest, { kind: 'section' }>,
): Promise<{ status: number; body: unknown }> {
  const fail = (): { status: number; body: unknown } => ({
    status: 500,
    body: { error: 'internal_error' },
  })

  if (request.section === 'usuarios') {
    const { data, error } = await admin.rpc('admin_usuarios', {
      p_search: request.search === '' ? null : request.search,
      p_filter: request.filter,
      p_limit: request.limit,
      p_offset: request.offset,
    })
    if (error) {
      console.error('admin-panel: admin_usuarios failed', error.code ?? 'unknown')
      return fail()
    }
    const rows = (data ?? []) as Array<{ o_total: number }>
    return { status: 200, body: { data: { rows, total: rows[0]?.o_total ?? 0 } } }
  }

  if (request.section === 'usuario') {
    const { data, error } = await admin.rpc('admin_usuario', { p_id: request.userId })
    if (error) {
      console.error('admin-panel: admin_usuario failed', error.code ?? 'unknown')
      return fail()
    }
    if (data === null) return { status: 404, body: { error: 'not_found' } }
    return { status: 200, body: { data } }
  }

  const fn = {
    resumen: 'admin_resumen',
    plus: 'admin_plus',
    ia: 'admin_ia',
    mp: 'admin_mp',
    sistema: 'admin_sistema',
  }[request.section]
  const { data, error } = await admin.rpc(fn)
  if (error) {
    console.error(`admin-panel: ${fn} failed`, error.code ?? 'unknown')
    return fail()
  }
  return { status: 200, body: { data } }
}

async function sendPush(
  admin: ServiceClient,
  adminEmail: string,
  request: Extract<AdminRequest, { kind: 'push' }>,
): Promise<{ status: number; body: unknown }> {
  const push = request.push
  const userId = push.userId
  if (!userId) return { status: 400, body: { error: 'invalid_request' } }

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!vapidPublic || !vapidPrivate || !vapidSubject?.startsWith('mailto:')) {
    console.error('admin-panel: missing VAPID configuration')
    return { status: 500, body: { error: 'server_misconfigured' } }
  }

  const { data: found, error: userError } = await admin.auth.admin.getUserById(userId)
  if (userError || !found.user) return { status: 404, body: { error: 'not_found' } }

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
      return { status: 500, body: { error: 'internal_error' } }
    }
    subscriptions.push(...(data as PushSubscriptionRow[]))
    if (data.length < PAGE_SIZE) break
  }
  if (subscriptions.length === 0) {
    return { status: 200, body: { recipients: 0, sent: 0, failed: 0, removed: 0 } }
  }

  // Rate limit per admin (10 per hour), counted from the audit table.
  const since = new Date(Date.now() - PUSH_WINDOW_MS).toISOString()
  const { data: recent, error: recentError } = await admin
    .from('admin_acciones')
    .select('created_at')
    .eq('admin_email', adminEmail)
    .eq('action', PUSH_ACTION)
    .gte('created_at', since)
  if (recentError) {
    console.error('admin-panel: could not read the rate limit')
    return { status: 500, body: { error: 'internal_error' } }
  }
  const decision = decidePushRateLimit(
    (recent ?? []).map((row) => (row as { created_at: string }).created_at),
    new Date(),
  )
  if (!decision.allowed) {
    return {
      status: 429,
      body: { error: 'rate_limited', retry_after_seconds: decision.retryAfterSeconds },
    }
  }

  // Reserve the slot BEFORE sending, so concurrent requests count. No message text is stored.
  const { data: reserved, error: reserveError } = await admin
    .from('admin_acciones')
    .insert({ admin_email: adminEmail, action: PUSH_ACTION, target_user_id: userId })
    .select('id')
    .single()
  if (reserveError || !reserved) {
    console.error('admin-panel: could not record the action')
    return { status: 500, body: { error: 'internal_error' } }
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  const payload = JSON.stringify(buildPayload(push))
  const outcome = await sendToAll(subscriptions, (s) =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload,
      {
        TTL: TTL_SECONDS,
      },
    ),
  )

  if (outcome.removedIds.length > 0) {
    const { error } = await admin.from('push_subscriptions').delete().in('id', outcome.removedIds)
    if (error) console.error('admin-panel: could not prune dead subscriptions')
  }
  const { error: updateError } = await admin
    .from('admin_acciones')
    .update({ sent_count: outcome.sent, failed_count: outcome.failed })
    .eq('id', (reserved as { id: number }).id)
  if (updateError) console.error('admin-panel: could not record the result')

  return {
    status: 200,
    body: {
      recipients: subscriptions.length,
      sent: outcome.sent,
      failed: outcome.failed,
      removed: outcome.removedIds.length,
    },
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
  const decision = decideAccess(userData.user, parseAllowlist(Deno.env.get('ADMIN_EMAILS')))
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

  const result =
    parsed.value.kind === 'push'
      ? await sendPush(admin, decision.email, parsed.value)
      : await readSection(admin, parsed.value)
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
