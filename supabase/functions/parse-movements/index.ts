// Supabase Edge Function (Deno): turns free text ("gasté 5 lucas en el bondi y 18 en el almuerzo") into a draft
// list of movements. It NEVER writes transactions: the client shows a confirmation list and saves.
//
// Security model (see docs/SPRINT_6.md):
//   * verify_jwt = true (supabase/config.toml): the gateway rejects calls without a valid user JWT.
//   * Every database read and the quota RPC run with the CALLER's token and the anon key, so RLS applies.
//     The service role key is never used here.
//   * The Anthropic call is a plain fetch to the Messages API (no SDK). The key lives only in the ANTHROPIC_API_KEY secret. It is never logged or returned.
//   * The user's text is passed to the model strictly as data (escaped, delimited, system prompt says so).
//   * Output is validated server-side; the model never chooses ids, only names from the caller's own lists.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildRequestBody,
  classifyQuotaError,
  contentLengthTooLarge,
  extractToolInput,
  isAuthenticatedUserJwt,
  MAX_BODY_BYTES,
  parseRequest,
  pickAllowedOrigin,
  resolveToday,
  serverToday,
  utf8ByteLength,
  validateModelOutput,
  type AccountRef,
  type CategoryRef,
} from './lib.ts'

const FEATURE = 'parse_movements'
const DAILY_LIMIT = 30
const MODEL_TIMEOUT_MS = 15_000

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  })
}

/** Reads the body as text, stopping as soon as it exceeds the byte cap. Returns null when over the cap. */
async function readBodyCapped(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder().decode(bytes)
  // Defense in depth: the decoded text must also fit the cap when measured with TextEncoder.
  return utf8ByteLength(text) > maxBytes ? null : text
}

/** Calls the Messages API. Returns the parsed JSON response or null on any failure (only the class is logged). */
async function callModel(apiKey: string, requestBody: unknown): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error('parse-movements: model call failed', response.status)
      return null
    }
    return await response.json()
  } catch (error) {
    // Log only the error class: never the key, the request body or the response body.
    console.error('parse-movements: model call failed', error instanceof Error ? error.name : 'unknown')
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function handle(req: Request, origin: string | null): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, origin)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'not_authenticated' }, origin)
  // The gateway already verified the signature; this only rejects non-user tokens (e.g. the anon key).
  if (!isAuthenticatedUserJwt(authHeader.slice('Bearer '.length).trim())) {
    return json(401, { error: 'not_authenticated' }, origin)
  }

  if (contentLengthTooLarge(req.headers.get('Content-Length'))) {
    return json(413, { error: 'invalid_request' }, origin)
  }
  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return json(413, { error: 'invalid_request' }, origin)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json(400, { error: 'invalid_request' }, origin)
  }
  const parsed = parseRequest(body)
  if (!parsed.ok) return json(400, { error: 'invalid_request' }, origin)
  // The client's `today` is only a hint: the server date (Argentina) wins unless they are within one day.
  const today = resolveToday(parsed.today, serverToday())

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!supabaseUrl || !anonKey || !anthropicKey) {
    console.error('parse-movements: missing environment configuration')
    return json(500, { error: 'server_misconfigured' }, origin)
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
    if (kind === 'quota_exceeded') return json(429, { error: 'ai_quota_exceeded' }, origin)
    if (kind === 'plus_required') return json(402, { error: 'plus_required' }, origin)
    if (kind === 'not_authenticated') return json(401, { error: 'not_authenticated' }, origin)
    console.error('parse-movements: quota check failed', quota.error.code)
    return json(500, { error: 'server_error' }, origin)
  }

  // From here on the use is charged and is never given back (see docs/SPRINT_6.md).
  const [categoriesResult, accountsResult] = await Promise.all([
    supabase.from('categories').select('id, name, kind').is('archived_at', null).order('name'),
    supabase
      .from('accounts')
      .select('id, name')
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
  ])
  if (categoriesResult.error || accountsResult.error) {
    console.error('parse-movements: could not load categories/accounts')
    return json(500, { error: 'server_error' }, origin)
  }
  const categories = (categoriesResult.data ?? []) as CategoryRef[]
  const accounts = (accountsResult.data ?? []) as AccountRef[]

  const modelResponse = await callModel(
    anthropicKey,
    buildRequestBody({ text: parsed.text, today, categories, accounts }),
  )
  const extracted = modelResponse === null ? null : extractToolInput(modelResponse)
  if (!extracted || !extracted.ok) {
    if (extracted) console.error('parse-movements: unusable model response', extracted.reason)
    return json(502, { error: 'ai_unavailable' }, origin)
  }

  const result = validateModelOutput(extracted.input, { today, categories, accounts })
  return json(200, result, origin)
}

Deno.serve(async (req: Request): Promise<Response> => {
  let origin: string | null = null
  try {
    const requestOrigin = req.headers.get('Origin')
    origin = pickAllowedOrigin(requestOrigin, Deno.env.get('ALLOWED_ORIGINS'))
    // A browser request from an origin that is not allowed gets no CORS headers (and a 403).
    if (requestOrigin && !origin) return json(403, { error: 'origin_not_allowed' }, null)
    return await handle(req, origin)
  } catch (error) {
    // Log only the error class: never messages that could carry the user's text or secrets.
    console.error('parse-movements: unexpected error', error instanceof Error ? error.name : 'unknown')
    return json(500, { error: 'server_error' }, origin)
  }
})
