// Supabase Edge Function (Deno): owner-triggered and scheduled web push. Thin wiring only; the logic lives in lib.ts
// (unit-tested under Vitest with an injected sender).
//
// Security model:
//   * verify_jwt = false (supabase/config.toml): the caller is the app owner (curl) or the database cron, not a
//     Supabase user. The shared secret in `x-moni-push-secret` is compared in constant time with the Edge secrets
//     PUSH_ADMIN_SECRET (owner) or PUSH_CRON_SECRET (pg_cron) BEFORE any database or push work. Any failure answers
//     401 with no detail.
//   * Two kinds of call: a message (`{ kind, title, body, audience, ... }`, e.g. the nightly reminder) and a job
//     (`{ "job": "plus_expiry" }`, the daily Plus expiry notices).
//   * Subscriptions of suspended accounts never receive anything.
//   * The service-role client is the only door to push_subscriptions (all users) and push_messages.
//   * Endpoints, keys and push-service bodies are never logged or returned.
//   * No CORS: server-to-server only.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { jsonResponse, readBodyCapped } from '../_shared/http.ts'
import {
  buildPayload,
  filterSuspended,
  parsePushJob,
  parsePushRequest,
  runPlusExpiryJob,
  sendToAll,
  TTL_SECONDS,
  verifyAnyPushSecret,
  type PlusExpiryDue,
  type PushSubscriptionRow,
} from './lib.ts'

const MAX_BODY_BYTES = 4096
const PAGE_SIZE = 1000
const SUBSCRIPTION_COLUMNS = 'id, user_id, endpoint, p256dh, auth'

type ServiceClient = ReturnType<typeof createClient>

async function loadSuspendedIds(admin: ServiceClient): Promise<Set<string> | null> {
  const ids = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('account_suspensions')
      .select('user_id')
      .order('user_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return null
    for (const row of data as Array<{ user_id: string }>) ids.add(row.user_id)
    if (data.length < PAGE_SIZE) break
  }
  return ids
}

async function runPlusExpiry(
  admin: ServiceClient,
  vapid: { subject: string; publicKey: string; privateKey: string },
): Promise<Response> {
  const suspended = await loadSuspendedIds(admin)
  if (suspended === null) {
    console.error('push-send: could not load suspended accounts')
    return jsonResponse(500, { error: 'internal_error' }, null)
  }
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  try {
    const result = await runPlusExpiryJob({
      listDue: async () => {
        const { data, error } = await admin.rpc('plus_expiry_due', { p_levels: [3, 1] })
        if (error) throw new Error('plus_expiry_due')
        return (
          (data ?? []) as Array<{ o_user_id: string; o_expires_at: string; o_days_left: number }>
        ).map((row): PlusExpiryDue => ({
          userId: row.o_user_id,
          expiresAt: row.o_expires_at,
          daysLeft: row.o_days_left,
        }))
      },
      loadSubscriptions: async (userId) => {
        if (suspended.has(userId)) return []
        const { data, error } = await admin
          .from('push_subscriptions')
          .select(SUBSCRIPTION_COLUMNS)
          .eq('user_id', userId)
        if (error) throw new Error('load_subscriptions')
        return data as PushSubscriptionRow[]
      },
      send: (s, payload) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: TTL_SECONDS },
        ),
      recordNotice: async (due) => {
        const { data, error } = await admin.rpc('record_plus_expiry_notice', {
          p_user: due.userId,
          p_expires_at: due.expiresAt,
          p_level: due.daysLeft,
          p_source: 'cron',
        })
        if (error) throw new Error('record_plus_expiry_notice')
        return data === true
      },
      pruneSubscriptions: async (ids) => {
        const { error } = await admin.from('push_subscriptions').delete().in('id', ids)
        if (error) console.error('push-send: could not prune dead subscriptions')
      },
      recordMessage: async (entry) => {
        const { error } = await admin.from('push_messages').insert({
          kind: 'plus_expiry',
          title: entry.title,
          body: entry.body,
          url: entry.url,
          audience: 'user',
          target_user_id: entry.userId,
          sent_at: new Date().toISOString(),
          sent_count: entry.sent,
          failed_count: entry.failed,
          removed_count: entry.removed,
        })
        if (error) console.error('push-send: could not record the message')
      },
    })
    return jsonResponse(200, result, null)
  } catch {
    console.error('push-send: the plus_expiry job failed')
    return jsonResponse(500, { error: 'internal_error' }, null)
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, null)
  if (
    !(await verifyAnyPushSecret(req.headers.get('x-moni-push-secret'), [
      Deno.env.get('PUSH_ADMIN_SECRET'),
      Deno.env.get('PUSH_CRON_SECRET'),
    ]))
  ) {
    return jsonResponse(401, { error: 'unauthorized' }, null)
  }

  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return jsonResponse(413, { error: 'invalid_request' }, null)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'invalid_request' }, null)
  }

  const isJob =
    typeof parsedJson === 'object' &&
    parsedJson !== null &&
    !Array.isArray(parsedJson) &&
    'job' in parsedJson
  const job = isJob ? parsePushJob(parsedJson) : null
  if (job && !job.ok)
    return jsonResponse(400, { error: 'invalid_request', reason: job.reason }, null)
  const parsed = job ? null : parsePushRequest(parsedJson)
  if (parsed && !parsed.ok)
    return jsonResponse(400, { error: 'invalid_request', reason: parsed.reason }, null)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (
    !supabaseUrl ||
    !serviceKey ||
    !vapidPublic ||
    !vapidPrivate ||
    !vapidSubject?.startsWith('mailto:')
  ) {
    console.error('push-send: missing environment configuration')
    return jsonResponse(500, { error: 'server_misconfigured' }, null)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (job) {
    return runPlusExpiry(admin, {
      subject: vapidSubject,
      publicKey: vapidPublic,
      privateKey: vapidPrivate,
    })
  }
  if (!parsed || !parsed.ok) return jsonResponse(400, { error: 'invalid_request' }, null)
  const request = parsed.value

  // Load every matching subscription (paged: PostgREST caps a response at 1000 rows).
  const loaded: PushSubscriptionRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = admin
      .from('push_subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (request.audience === 'user' && request.userId) query = query.eq('user_id', request.userId)
    const { data, error } = await query
    if (error) {
      console.error('push-send: could not load subscriptions')
      return jsonResponse(500, { error: 'internal_error' }, null)
    }
    loaded.push(...(data as PushSubscriptionRow[]))
    if (data.length < PAGE_SIZE) break
  }

  // Suspended accounts receive nothing (neither the nightly reminder nor an owner message).
  const suspended = await loadSuspendedIds(admin)
  if (suspended === null) {
    console.error('push-send: could not load suspended accounts')
    return jsonResponse(500, { error: 'internal_error' }, null)
  }
  const subscriptions = filterSuspended(loaded, suspended)

  if (request.dryRun) {
    return jsonResponse(200, { dry_run: true, recipients: subscriptions.length }, null)
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  const payload = JSON.stringify(buildPayload(request))
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
    if (error) console.error('push-send: could not prune dead subscriptions')
  }

  const { error: recordError } = await admin.from('push_messages').insert({
    kind: request.kind,
    title: request.title,
    body: request.body,
    url: request.url,
    audience: request.audience,
    target_user_id: request.userId,
    sent_at: new Date().toISOString(),
    sent_count: outcome.sent,
    failed_count: outcome.failed,
    removed_count: outcome.removedIds.length,
  })
  if (recordError) console.error('push-send: could not record the message')

  return jsonResponse(
    200,
    { sent: outcome.sent, failed: outcome.failed, removed: outcome.removedIds.length },
    null,
  )
}

Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch {
    console.error('push-send: unexpected error')
    return jsonResponse(500, { error: 'internal_error' }, null)
  }
})
