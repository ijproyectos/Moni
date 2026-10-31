// Supabase Edge Function (Deno): Mercado Pago `mp-connect` notifications (account deauthorization).
//
// Security model:
//   * verify_jwt = false (supabase/config.toml): Mercado Pago calls this URL without a Supabase JWT. The HMAC-SHA256
//     `x-signature` is the authentication and is checked BEFORE any database work (see lib.ts).
//   * Behind MP_CONNECT_WEBHOOK_ENABLED (default off): until it is exactly 'true' the answer is 200 ignored:disabled.
//     Do not flip it before task 0.3 captured the real payload and manifest.
//   * Logs carry outcome labels only: never the secret, tokens, the signature or payload bodies.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { readBodyCapped } from '../_shared/http.ts'
import { MAX_BODY_BYTES, processConnectWebhook } from './lib.ts'

function reply(status: number, body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const enabled = Deno.env.get('MP_CONNECT_WEBHOOK_ENABLED')
  if (enabled !== 'true') return reply(200, { ignored: 'disabled' })

  const secret = Deno.env.get('MP_CONNECT_WEBHOOK_SECRET') ?? Deno.env.get('MP_WEBHOOK_SECRET') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !supabaseUrl || !serviceKey) {
    console.error('mp-connect-webhook: missing environment configuration')
    return reply(500, { error: 'server_misconfigured' })
  }

  const rawBody = await readBodyCapped(req, MAX_BODY_BYTES)
  if (rawBody === null) return reply(413, { error: 'payload_too_large' })

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await processConnectWebhook(
    {
      enabled,
      secret,
      signatureHeader: req.headers.get('x-signature'),
      requestId: req.headers.get('x-request-id'),
      queryDataId: new URL(req.url).searchParams.get('data.id'),
      rawBody,
      nowMs: Date.now(),
    },
    {
      // Same columns as the mp-oauth `unlink` action: tokens and key_version nulled, transactions untouched.
      unlinkByMpUserId: async (mpUserId) => {
        const { data, error } = await admin
          .from('mp_connections')
          .update({
            status: 'unlinked',
            access_token_enc: null,
            refresh_token_enc: null,
            key_version: null,
            sync_lease_until: null,
            updated_at: new Date().toISOString(),
          })
          .eq('mp_user_id', mpUserId)
          .neq('status', 'unlinked')
          .select('user_id')
        if (error) throw new Error('unlink_failed')
        return data?.length ?? 0
      },
    },
  )
  if (result.status === 401) console.error('mp-connect-webhook: signature rejected')
  return reply(result.status, result.body)
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req)
  } catch (error) {
    // 5xx so Mercado Pago retries; only the error class name is logged.
    console.error('mp-connect-webhook: unexpected error', error instanceof Error ? error.name : 'unknown')
    return reply(500, { error: 'server_error' })
  }
})
