// Supabase Edge Function (Deno): receives WhatsApp Cloud API webhooks for Moni, and — for a number already linked
// to a Moni account — loads an expense/income from the free text of the message, or undoes the last one.
//
// Security model:
//   * verify_jwt = false (supabase/config.toml): Meta calls this URL with no Supabase JWT.
//   * GET is the subscription handshake: answered only when hub.verify_token matches WHATSAPP_VERIFY_TOKEN.
//   * POST is authenticated by X-Hub-Signature-256 (HMAC-SHA256 of the raw body, keyed with WHATSAPP_APP_SECRET),
//     checked BEFORE any JSON parsing or database work. Bad/missing signature => 401.
//   * Every DB read/write here runs with the SERVICE ROLE (Meta's call carries no user JWT): there is no RLS to
//     lean on, so every query is explicitly scoped by the resolved user_id. This mirrors mp-webhook, not
//     insights-chat/parse-movements (which run with the caller's own token).
//   * Inbound messages are stored as-is in whatsapp_inbound_messages, keyed by wamid (idempotent against Meta's
//     retries). A message whose wa_id is not yet in whatsapp_links gets a "not linked yet" reply and nothing else:
//     self-service linking is a separate, not-yet-built feature.
//   * Expense/income extraction reuses the already-shipped parse-movements engine (same prompt, schema, Argentine-
//     slang amount parsing, category/account matching) instead of a second copy of it. What parse-movements does
//     NOT do — because it only returns a draft for a human to confirm — is covered here: picking a guaranteed
//     non-null category/account before insert, the whatsapp_expense_log idempotency/undo trail, and reply wording.
//   * Logs carry ids and outcome labels only: never the verify token, the app secret, the signature, message text,
//     or the access token.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { callAnthropic } from '../_shared/http.ts'
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildRequestBody,
  classifyQuotaError,
  extractToolInput,
  serverToday,
  validateModelOutput,
  type AccountRef,
  type CategoryRef,
  type ParsedMovement,
} from '../parse-movements/lib.ts'
import {
  buildSendTextPayload,
  formatConfirmationReply,
  graphMessagesUrl,
  isUndoCommand,
  MAX_BODY_BYTES,
  parseInboundMessages,
  parseVerifyRequest,
  pickFallbackCategoryId,
  REPLY_MODEL_UNAVAILABLE,
  REPLY_NO_AMOUNT,
  REPLY_NO_DESTINATION,
  REPLY_NO_TEXT,
  REPLY_NOT_LINKED,
  REPLY_PLUS_REQUIRED,
  REPLY_QUOTA_EXCEEDED,
  REPLY_UNDO_DONE,
  REPLY_UNDO_FAILED,
  REPLY_UNDO_NONE,
  resolveChallenge,
  UNDO_WINDOW_MS,
  verifyMetaSignature,
  WHATSAPP_EXPENSE_DAILY_LIMIT,
  WHATSAPP_EXPENSE_FEATURE,
  type InboundMessage,
} from './lib.ts'

const LOG = 'whatsapp-webhook'
const MODEL_TIMEOUT_MS = 15_000

type AdminClient = ReturnType<typeof createClient>

function reply(status: number, body: string | Record<string, unknown> = {}): Response {
  const isText = typeof body === 'string'
  return new Response(isText ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': isText ? 'text/plain' : 'application/json',
      'Cache-Control': 'no-store',
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
  return new TextDecoder().decode(bytes)
}

function handleVerify(req: Request, verifyToken: string): Response {
  const parsed = parseVerifyRequest(new URL(req.url))
  const challenge = resolveChallenge(parsed, verifyToken)
  if (challenge === null) {
    console.error(`${LOG}: verification handshake rejected`)
    return reply(403, { error: 'verification_failed' })
  }
  return reply(200, challenge)
}

/** Best-effort: a failed send never rolls back work already recorded in the database. */
async function sendReply(
  waToken: string,
  phoneNumberId: string,
  to: string,
  text: string,
): Promise<void> {
  try {
    const response = await fetch(graphMessagesUrl(phoneNumberId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSendTextPayload(to, text)),
    })
    if (!response.ok) console.error(`${LOG}: reply send failed`, response.status)
  } catch (error) {
    console.error(`${LOG}: reply send failed`, error instanceof Error ? error.name : 'unknown')
  }
}

async function findLinkedUser(admin: AdminClient, waId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('whatsapp_links')
    .select('user_id')
    .eq('wa_id', waId)
    .maybeSingle()
  if (error) {
    console.error(`${LOG}: link lookup failed`, error.code)
    return null
  }
  return (data as { user_id: string } | null)?.user_id ?? null
}

async function handleUndo(
  admin: AdminClient,
  userId: string,
  waToken: string,
  phoneNumberId: string,
  waId: string,
): Promise<void> {
  const since = new Date(Date.now() - UNDO_WINDOW_MS).toISOString()
  const { data, error } = await admin
    .from('whatsapp_expense_log')
    .select('transaction_id')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error(`${LOG}: undo lookup failed`, error.code)
    return sendReply(waToken, phoneNumberId, waId, REPLY_UNDO_FAILED)
  }
  const row = data as { transaction_id: string } | null
  if (!row) return sendReply(waToken, phoneNumberId, waId, REPLY_UNDO_NONE)

  // whatsapp_expense_log.transaction_id cascades on delete: removing the transaction removes the log row too.
  const { error: deleteError } = await admin.from('transactions').delete().eq('id', row.transaction_id)
  if (deleteError) {
    console.error(`${LOG}: undo delete failed`, deleteError.code)
    return sendReply(waToken, phoneNumberId, waId, REPLY_UNDO_FAILED)
  }
  return sendReply(waToken, phoneNumberId, waId, REPLY_UNDO_DONE)
}

async function handleExpenseMessage(
  admin: AdminClient,
  anthropicKey: string,
  waToken: string,
  phoneNumberId: string,
  userId: string,
  message: InboundMessage,
): Promise<void> {
  // Idempotency: Meta resends the same wamid when it does not get a timely 200. A row already logged for this
  // wamid means this exact message was already turned into a transaction (or attempted) — never process it twice.
  const already = await admin
    .from('whatsapp_expense_log')
    .select('id', { count: 'exact', head: true })
    .eq('wamid', message.wamid)
  if (already.error) console.error(`${LOG}: idempotency check failed`, already.error.code)
  if ((already.count ?? 0) > 0) return

  const quota = await admin.rpc('consume_ai_quota_for', {
    p_user: userId,
    p_feature: WHATSAPP_EXPENSE_FEATURE,
    p_daily_limit: WHATSAPP_EXPENSE_DAILY_LIMIT,
  })
  if (quota.error) {
    const kind = classifyQuotaError(quota.error)
    if (kind === 'plus_required') return sendReply(waToken, phoneNumberId, message.waId, REPLY_PLUS_REQUIRED)
    if (kind === 'quota_exceeded') return sendReply(waToken, phoneNumberId, message.waId, REPLY_QUOTA_EXCEEDED)
    console.error(`${LOG}: quota check failed`, quota.error.code)
    return sendReply(waToken, phoneNumberId, message.waId, REPLY_MODEL_UNAVAILABLE)
  }

  // From here on the use is charged and is never given back (same rule as parse-movements, see docs/SPRINT_6.md).
  const [categoriesResult, accountsResult] = await Promise.all([
    admin
      .from('categories')
      .select('id, name, kind')
      .eq('owner_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
    admin
      .from('accounts')
      .select('id, name')
      .eq('owner_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
  ])
  if (categoriesResult.error || accountsResult.error) {
    console.error(`${LOG}: could not load categories/accounts`)
    return sendReply(waToken, phoneNumberId, message.waId, REPLY_MODEL_UNAVAILABLE)
  }
  const categories = (categoriesResult.data ?? []) as CategoryRef[]
  const accounts = (accountsResult.data ?? []) as AccountRef[]
  const today = serverToday()

  const modelResponse = await callAnthropic(
    ANTHROPIC_URL,
    ANTHROPIC_VERSION,
    anthropicKey,
    buildRequestBody({ text: message.body ?? '', today, categories, accounts }),
    MODEL_TIMEOUT_MS,
    LOG,
  )
  const extracted = modelResponse === null ? null : extractToolInput(modelResponse)
  if (!extracted || !extracted.ok) {
    if (extracted) console.error(`${LOG}: unusable model response`, extracted.reason)
    return sendReply(waToken, phoneNumberId, message.waId, REPLY_MODEL_UNAVAILABLE)
  }

  const result = validateModelOutput(extracted.input, { today, categories, accounts })
  if (result.movements.length === 0) {
    return sendReply(waToken, phoneNumberId, message.waId, REPLY_NO_AMOUNT)
  }

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name] as const))
  const confirmed: { movement: ParsedMovement; categoryName: string }[] = []
  for (const movement of result.movements) {
    const categoryId = movement.categoryId ?? pickFallbackCategoryId(categories, movement.kind)
    const accountId = movement.accountId
    if (!categoryId || !accountId) continue // no category/account of that kind exists at all (past onboarding, never happens)

    const { data: inserted, error: insertError } = await admin
      .from('transactions')
      .insert({
        owner_id: userId,
        account_id: accountId,
        category_id: categoryId,
        kind: movement.kind,
        amount: movement.amountCents / 100,
        occurred_on: movement.occurredOn,
        note: movement.note,
      })
      .select('id')
      .single()
    if (insertError || !inserted) {
      console.error(`${LOG}: transaction insert failed`, insertError?.code)
      continue
    }
    const { error: logError } = await admin.from('whatsapp_expense_log').insert({
      wamid: message.wamid,
      user_id: userId,
      transaction_id: (inserted as { id: string }).id,
    })
    if (logError) console.error(`${LOG}: expense log insert failed`, logError.code)
    confirmed.push({ movement, categoryName: categoryNameById.get(categoryId) ?? 'Otros' })
  }

  if (confirmed.length === 0) {
    return sendReply(waToken, phoneNumberId, message.waId, REPLY_NO_DESTINATION)
  }
  return sendReply(waToken, phoneNumberId, message.waId, formatConfirmationReply(confirmed))
}

async function handleLinkedMessage(
  admin: AdminClient,
  anthropicKey: string,
  waToken: string,
  phoneNumberId: string,
  userId: string,
  message: InboundMessage,
): Promise<void> {
  if (isUndoCommand(message.body ?? '')) {
    return handleUndo(admin, userId, waToken, phoneNumberId, message.waId)
  }
  if (message.body === null) {
    return sendReply(waToken, phoneNumberId, message.waId, REPLY_NO_TEXT)
  }
  return handleExpenseMessage(admin, anthropicKey, waToken, phoneNumberId, userId, message)
}

async function processMessages(
  admin: AdminClient,
  messages: InboundMessage[],
  env: { anthropicKey: string | undefined; waToken: string | undefined; phoneNumberId: string | undefined },
): Promise<void> {
  for (const message of messages) {
    try {
      const userId = await findLinkedUser(admin, message.waId)
      if (!env.waToken || !env.phoneNumberId) {
        // Replying needs the send credentials; without them we still keep the audit row inserted by the caller.
        console.error(`${LOG}: missing WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID, cannot reply`)
        continue
      }
      if (!userId) {
        await sendReply(env.waToken, env.phoneNumberId, message.waId, REPLY_NOT_LINKED)
        continue
      }
      if (!env.anthropicKey) {
        console.error(`${LOG}: missing ANTHROPIC_API_KEY, cannot process linked message`)
        await sendReply(env.waToken, env.phoneNumberId, message.waId, REPLY_MODEL_UNAVAILABLE)
        continue
      }
      await handleLinkedMessage(admin, env.anthropicKey, env.waToken, env.phoneNumberId, userId, message)
    } catch (error) {
      // One message's failure must never take down the rest of the batch or the webhook's 200 to Meta.
      console.error(`${LOG}: message handling failed`, error instanceof Error ? error.name : 'unknown')
    }
  }
}

async function handleEvent(req: Request, appSecret: string): Promise<Response> {
  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return reply(413, { error: 'payload_too_large' })

  if (!(await verifyMetaSignature(appSecret, req.headers.get('x-hub-signature-256'), raw))) {
    console.error(`${LOG}: signature rejected`)
    return reply(401, { error: 'invalid_signature' })
  }

  let body: unknown = null
  try {
    body = JSON.parse(raw)
  } catch {
    // Signed but not valid JSON: acknowledge so Meta does not retry something it will never fix by retrying.
    return reply(200, { ignored: 'invalid_json' })
  }

  const messages = parseInboundMessages(body)
  if (messages.length === 0) return reply(200, { ignored: 'no_messages' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error(`${LOG}: missing environment configuration`)
    return reply(500, { error: 'server_misconfigured' })
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await admin.from('whatsapp_inbound_messages').insert(
    messages.map((m) => ({
      wamid: m.wamid,
      wa_id: m.waId,
      message_type: m.kind,
      body: m.body,
      sent_at: new Date(m.timestamp * 1000).toISOString(),
    })),
  )
  // A duplicate wamid (Meta retried the same delivery) is expected and not an error: unique violation => ok.
  if (error && error.code !== '23505') {
    console.error(`${LOG}: insert failed`, error.code)
    return reply(500, { error: 'server_error' })
  }

  await processMessages(admin, messages, {
    anthropicKey: Deno.env.get('ANTHROPIC_API_KEY'),
    waToken: Deno.env.get('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: Deno.env.get('WHATSAPP_PHONE_NUMBER_ID'),
  })

  return reply(200, { handled: messages.length })
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
    if (!verifyToken) {
      console.error(`${LOG}: missing environment configuration`)
      return reply(500, { error: 'server_misconfigured' })
    }
    return handleVerify(req, verifyToken)
  }
  if (req.method === 'POST') {
    const appSecret = Deno.env.get('WHATSAPP_APP_SECRET')
    if (!appSecret) {
      console.error(`${LOG}: missing environment configuration`)
      return reply(500, { error: 'server_misconfigured' })
    }
    return handleEvent(req, appSecret)
  }
  return reply(405, { error: 'method_not_allowed' })
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req)
  } catch (error) {
    console.error(`${LOG}: unexpected error`, error instanceof Error ? error.name : 'unknown')
    return reply(500, { error: 'server_error' })
  }
})
