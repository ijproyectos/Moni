// Supabase Edge Function (Deno): owner-triggered web push. Thin wiring only; the logic lives in lib.ts
// (unit-tested under Vitest with an injected sender).
//
// Security model:
//   * verify_jwt = false (supabase/config.toml): the caller is the app owner (curl), not a Supabase user. The shared
//     secret in `x-moni-push-secret` is compared in constant time with the Edge secret PUSH_ADMIN_SECRET BEFORE any
//     database or push work. Any failure answers 401 with no detail.
//   * The service-role client is the only door to push_subscriptions (all users) and push_messages.
//   * Endpoints, keys and push-service bodies are never logged or returned.
//   * No CORS: server-to-server only.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import webpush from 'npm:web-push@3.6.7'
import { jsonResponse, readBodyCapped } from '../_shared/http.ts'
import {
  buildPayload,
  parsePushRequest,
  sendToAll,
  TTL_SECONDS,
  verifyPushSecret,
  type PushSubscriptionRow,
} from './lib.ts'

const MAX_BODY_BYTES = 4096
const PAGE_SIZE = 1000

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, null)
  if (
    !(await verifyPushSecret(
      req.headers.get('x-moni-push-secret'),
      Deno.env.get('PUSH_ADMIN_SECRET'),
    ))
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
  const parsed = parsePushRequest(parsedJson)
  if (!parsed.ok)
    return jsonResponse(400, { error: 'invalid_request', reason: parsed.reason }, null)
  const request = parsed.value

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

  // Load every matching subscription (paged: PostgREST caps a response at 1000 rows).
  const subscriptions: PushSubscriptionRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (request.audience === 'user' && request.userId) query = query.eq('user_id', request.userId)
    const { data, error } = await query
    if (error) {
      console.error('push-send: could not load subscriptions')
      return jsonResponse(500, { error: 'internal_error' }, null)
    }
    subscriptions.push(...(data as PushSubscriptionRow[]))
    if (data.length < PAGE_SIZE) break
  }

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
