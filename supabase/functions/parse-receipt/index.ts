// Supabase Edge Function (Deno): reads ONE photographed receipt and returns a draft expense (merchant, total in
// ARS, date, suggested category). It NEVER writes transactions and NEVER stores the image: the client shows the
// same confirmation list used by voice/text and saves only after the person confirms.
//
// Security model (mirrors parse-movements, see docs/RECEIPT_SCAN.md):
//   * verify_jwt = true (supabase/config.toml): the gateway rejects calls without a valid user JWT.
//   * Every database read and the quota RPC run with the CALLER's token and the anon key, so RLS applies.
//     The service role key is never used here.
//   * The Anthropic call is a plain fetch to the Messages API (no SDK). The key lives only in the ANTHROPIC_API_KEY
//     secret. The key, the image and the model response are never logged or returned.
//   * The image goes to the model as a base64 image block; text inside it is treated as data (system prompt).
//   * Output is validated server-side; the model never chooses ids, only a category NAME from the caller's list.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { callAnthropic, jsonResponse, readBodyCapped, corsHeaders } from '../_shared/http.ts'
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildRequestBody,
  classifyQuotaError,
  contentLengthTooLarge,
  extractToolInput,
  isAuthenticatedUserJwt,
  MAX_BODY_BYTES,
  parseReceiptRequest,
  pickAllowedOrigin,
  resolveToday,
  serverToday,
  validateReceiptOutput,
  type CategoryRef,
} from './lib.ts'

const FEATURE = 'parse_receipt'
// Same daily limit semantics as parse-movements (the RPC clamps it to 1..100 and counts per feature per day).
const DAILY_LIMIT = 30
// Vision calls are slower than text ones.
const MODEL_TIMEOUT_MS = 25_000
const LOG = 'parse-receipt'

async function handle(req: Request, origin: string | null): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, origin)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'not_authenticated' }, origin)
  }
  // The gateway already verified the signature; this only rejects non-user tokens (e.g. the anon key).
  if (!isAuthenticatedUserJwt(authHeader.slice('Bearer '.length).trim())) {
    return jsonResponse(401, { error: 'not_authenticated' }, origin)
  }

  if (contentLengthTooLarge(req.headers.get('Content-Length'))) {
    return jsonResponse(413, { error: 'image_too_large' }, origin)
  }
  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return jsonResponse(413, { error: 'image_too_large' }, origin)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'invalid_request' }, origin)
  }
  const parsed = parseReceiptRequest(body)
  if (!parsed.ok) {
    return jsonResponse(
      parsed.error === 'image_too_large' ? 413 : 400,
      { error: parsed.error },
      origin,
    )
  }
  // The client's `today` is only a hint: the server date (Argentina) wins unless they are within one day.
  const today = resolveToday(parsed.today, serverToday())

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !anonKey || !anthropicKey) {
    console.error(`${LOG}: missing environment configuration`)
    return jsonResponse(500, { error: 'server_misconfigured' }, origin)
  }

  // The caller's identity: all reads below are filtered by RLS.
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
    if (kind === 'not_authenticated')
      return jsonResponse(401, { error: 'not_authenticated' }, origin)
    console.error(`${LOG}: quota check failed`, quota.error.code)
    return jsonResponse(500, { error: 'server_error' }, origin)
  }

  // From here on the use is charged and is never given back.
  const categoriesResult = await supabase
    .from('categories')
    .select('id, name, kind')
    .eq('kind', 'expense')
    .is('archived_at', null)
    .order('name')
  if (categoriesResult.error) {
    console.error(`${LOG}: could not load categories`)
    return jsonResponse(500, { error: 'server_error' }, origin)
  }
  const categories = (categoriesResult.data ?? []) as CategoryRef[]

  const modelResponse = await callAnthropic(
    ANTHROPIC_URL,
    ANTHROPIC_VERSION,
    anthropicKey,
    buildRequestBody({ image: parsed.image, mediaType: parsed.mediaType, today, categories }),
    MODEL_TIMEOUT_MS,
    LOG,
  )
  const extracted = modelResponse === null ? null : extractToolInput(modelResponse)
  if (!extracted || !extracted.ok) {
    if (extracted) console.error(`${LOG}: unusable model response`, extracted.reason)
    return jsonResponse(502, { error: 'ai_unavailable' }, origin)
  }

  const validation = validateReceiptOutput(extracted.input, { today, categories })
  if (!validation.ok) return jsonResponse(422, { error: validation.error }, origin)
  return jsonResponse(200, validation.result, origin)
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
    // Log only the error class: never messages that could carry the image or secrets.
    console.error(`${LOG}: unexpected error`, error instanceof Error ? error.name : 'unknown')
    return jsonResponse(500, { error: 'server_error' }, origin)
  }
})
