// Supabase Edge Function (Deno): the "Asistente" of Informes. The person chats with Moni about their own money and
// the model answers by calling READ-ONLY tools (see tools.ts). It NEVER writes anything. See docs/ASSISTANT.md.
//
// Security model (mirrors parse-movements / parse-receipt):
//   * verify_jwt = true (supabase/config.toml): the gateway rejects calls without a valid user JWT.
//   * Every database read and the quota RPC run with the CALLER's token and the anon key, so RLS applies.
//     The service role key is never used here.
//   * consume_ai_quota('insights_chat') runs first: Free users get 402 plus_required, over the limit 429.
//   * The Anthropic call is a plain fetch (no SDK). The key lives only in the ANTHROPIC_API_KEY secret.
//   * Raw errors, tool results and user text are never logged or returned to the client.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { callAnthropic, corsHeaders, jsonResponse, readBodyCapped } from '../_shared/http.ts'
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildSystemPrompt,
  classifyChatFailure,
  classifyQuotaError,
  contentLengthTooLarge,
  DAILY_LIMIT,
  FEATURE,
  isAuthenticatedUserJwt,
  jwtSubject,
  MAX_BODY_BYTES,
  parseChatRequest,
  pickAllowedOrigin,
  resolveModel,
  runChat,
  serverToday,
} from './lib.ts'
import { executeTool, type Db } from './tools.ts'

const LOG = 'insights-chat'

async function handle(req: Request, origin: string | null): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, origin)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'not_authenticated' }, origin)
  }
  const token = authHeader.slice('Bearer '.length).trim()
  // The gateway already verified the signature; this only rejects non-user tokens (e.g. the anon key).
  if (!isAuthenticatedUserJwt(token)) return jsonResponse(401, { error: 'not_authenticated' }, origin)

  if (contentLengthTooLarge(req.headers.get('Content-Length'))) {
    return jsonResponse(413, { error: 'invalid_request' }, origin)
  }
  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return jsonResponse(413, { error: 'invalid_request' }, origin)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'invalid_request' }, origin)
  }
  const parsed = parseChatRequest(body)
  if (!parsed.ok) return jsonResponse(400, { error: 'invalid_request' }, origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !anonKey || !anthropicKey) {
    console.error(`${LOG}: missing environment configuration`)
    return jsonResponse(500, { error: 'server_misconfigured' }, origin)
  }

  // The caller's identity: every read below is filtered by RLS.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Quota first (serialized per user in the database), before any model cost.
  const quota = await supabase.rpc('consume_ai_quota', {
    p_feature: FEATURE,
    p_daily_limit: DAILY_LIMIT,
  })
  if (quota.error) {
    const kind = classifyQuotaError(quota.error)
    if (kind === 'quota_exceeded') return jsonResponse(429, { error: 'ai_quota_exceeded' }, origin)
    if (kind === 'plus_required') return jsonResponse(402, { error: 'plus_required' }, origin)
    if (kind === 'not_authenticated') return jsonResponse(401, { error: 'not_authenticated' }, origin)
    console.error(`${LOG}: quota check failed`, quota.error.code)
    return jsonResponse(500, { error: 'server_error' }, origin)
  }

  // The server clock (Argentina) is the only source of "today".
  const today = serverToday()
  const db = supabase as unknown as Db
  const ctx = { today, userId: jwtSubject(token) }

  const outcome = await runChat(
    {
      callModel: (requestBody, timeoutMs) =>
        callAnthropic(ANTHROPIC_URL, ANTHROPIC_VERSION, anthropicKey, requestBody, timeoutMs, LOG),
      runTool: (name, input) => executeTool(db, name, input, ctx),
      now: () => Date.now(),
    },
    {
      model: resolveModel(Deno.env.get('INSIGHTS_CHAT_MODEL')),
      system: buildSystemPrompt(today),
      messages: parsed.messages,
    },
  )
  if (!outcome.ok) {
    console.error(`${LOG}: chat failed`, outcome.reason)
    const { status, error } = classifyChatFailure(outcome.reason)
    return jsonResponse(status, { error }, origin)
  }
  return jsonResponse(200, { reply: outcome.reply }, origin)
}

Deno.serve(async (req: Request): Promise<Response> => {
  let origin: string | null = null
  try {
    const requestOrigin = req.headers.get('Origin')
    origin = pickAllowedOrigin(requestOrigin, Deno.env.get('ALLOWED_ORIGINS'))
    // A browser request from an origin that is not allowed gets no CORS headers (and a 403).
    if (requestOrigin && !origin) return jsonResponse(403, { error: 'origin_not_allowed' }, null)
    return await handle(req, origin)
  } catch (error) {
    console.error(`${LOG}: unexpected error`, error instanceof Error ? error.name : 'unknown')
    return jsonResponse(500, { error: 'server_error' }, origin)
  }
})
