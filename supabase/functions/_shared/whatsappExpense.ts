// Transport-agnostic core of "load an expense/income by texting Moni". Both supabase/functions/whatsapp-webhook
// (Meta WhatsApp Cloud API) and supabase/functions/twilio-whatsapp-webhook (Twilio's WhatsApp Sandbox/API) call
// processInboundMessage with the same shape: this is the one place that decides what a linked number's message
// means, so the two transports can never drift into two different answers for the same text. Each transport
// supplies its own `sendReply` (how a reply actually leaves this server) and parses its own wire format into
// ExpenseMessage before calling in.
//
// Reuses the already-shipped parse-movements engine (prompt, schema, Argentine-slang amount parsing, category/
// account matching) instead of a second copy of it. What parse-movements does NOT do — because it only returns a
// draft for a human to confirm — is covered here: picking a guaranteed non-null category/account before insert,
// the whatsapp_expense_log idempotency/undo trail, and reply wording.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { callAnthropic } from './http.ts'
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildRequestBody,
  classifyQuotaError,
  extractToolInput,
  normalizeName,
  serverToday,
  validateModelOutput,
  type AccountRef,
  type CategoryRef,
  type Kind,
  type ParsedMovement,
} from '../parse-movements/lib.ts'

export type AdminClient = ReturnType<typeof createClient>

export const WHATSAPP_EXPENSE_FEATURE = 'whatsapp_expense'
export const WHATSAPP_EXPENSE_DAILY_LIMIT = 30
/** How long after creating a transaction from a WhatsApp message "deshacer"/"borrar" is still allowed to remove it. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000
const MODEL_TIMEOUT_MS = 15_000

export function isUndoCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  return normalized === 'deshacer' || normalized === 'borrar'
}

/** Argentine peso formatting: "." for thousands, "," for cents, cents dropped when exactly .00. Always positive. */
export function formatPesos(amountCents: number): string {
  const pesos = Math.max(0, Math.round(amountCents)) / 100
  const [intPart, fracPart] = pesos.toFixed(2).split('.')
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return fracPart === '00' ? `$${withThousands}` : `$${withThousands},${fracPart}`
}

/**
 * The category id to use when the model found no match (or named none). `categories` must already be the
 * CALLER'S OWN, non-archived, oldest-first (same precondition parse-movements' ValidationContext.accounts[0]
 * relies on for its own account fallback) — among the ones matching `kind`, one literally named "otros" wins,
 * else the oldest. Null only when the user has no category of that kind at all (never happens past onboarding).
 */
export function pickFallbackCategoryId(categories: readonly CategoryRef[], kind: Kind): string | null {
  const ofKind = categories.filter((c) => c.kind === kind)
  if (ofKind.length === 0) return null
  const otros = ofKind.find((c) => normalizeName(c.name) === 'otros')
  return (otros ?? ofKind[0]).id
}

export interface ConfirmedMovement {
  movement: ParsedMovement
  categoryName: string
}

const UNDO_HINT = 'Si me equivoqué, respondé "deshacer".'

export function formatConfirmationReply(items: readonly ConfirmedMovement[]): string {
  const lines = items.map(({ movement, categoryName }) => {
    const amount = formatPesos(movement.amountCents)
    const noteSuffix = movement.note ? ` (${movement.note})` : ''
    return movement.kind === 'expense'
      ? `Cargué ${amount} en ${categoryName}${noteSuffix} 🐱.`
      : `Cargué un ingreso de ${amount}${noteSuffix} 🐱.`
  })
  return [...lines, UNDO_HINT].join('\n')
}

export const REPLY_NOT_LINKED = 'Todavía no vinculé este número a tu cuenta de Moni.'
export const REPLY_NO_TEXT = 'Por ahora solo entiendo mensajes de texto.'
export const REPLY_NO_AMOUNT =
  'No encontré un monto claro. Probá de nuevo con el número, por ejemplo: "gasté 1500 en el super".'
export const REPLY_MODEL_UNAVAILABLE = 'No pude procesar tu mensaje ahora, probá de nuevo en un rato.'
export const REPLY_PLUS_REQUIRED = 'Cargar gastos por WhatsApp es una función de Moni Plus.'
export const REPLY_QUOTA_EXCEEDED = 'Llegaste al límite de cargas por WhatsApp de hoy. Probá de nuevo mañana.'
export const REPLY_UNDO_DONE = 'Listo, lo deshice.'
export const REPLY_UNDO_NONE = 'No tengo nada reciente para deshacer.'
export const REPLY_UNDO_FAILED = 'No pude deshacerlo ahora, probá de nuevo en un rato.'
export const REPLY_NO_DESTINATION =
  'No tengo dónde cargar esto todavía (te falta una categoría o una cuenta en Moni).'

/**
 * A message already normalized to the one shape every transport agrees on. `wa_id` is the sender's real phone
 * number (digits only, country code, no "+", no "whatsapp:" prefix — see each transport's own normalizer) and is
 * the identity whatsapp_links keys on, regardless of which API delivered the message. `wamid` is that provider's
 * own unique id for this exact message (Meta's wamid, Twilio's MessageSid, ...): the only thing it is used for
 * here is idempotency (whatsapp_inbound_messages/whatsapp_expense_log key on it), so any provider's own unique id
 * fits without changing the database.
 */
export interface ExpenseMessage {
  waId: string
  wamid: string
  body: string | null
}

export interface ExpenseEnv {
  admin: AdminClient
  anthropicKey: string | undefined
  /** Best-effort: a failed send never rolls back work already recorded in the database. */
  sendReply: (to: string, text: string) => Promise<void>
  /** Only for log labels, so a failure in one transport's logs is not confused with the other's. */
  logLabel: string
}

export async function findLinkedUser(admin: AdminClient, waId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('whatsapp_links')
    .select('user_id')
    .eq('wa_id', waId)
    .maybeSingle()
  if (error) {
    console.error('whatsappExpense: link lookup failed', error.code)
    return null
  }
  return (data as { user_id: string } | null)?.user_id ?? null
}

async function handleUndo(env: ExpenseEnv, userId: string, waId: string): Promise<void> {
  const since = new Date(Date.now() - UNDO_WINDOW_MS).toISOString()
  const { data, error } = await env.admin
    .from('whatsapp_expense_log')
    .select('transaction_id')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error(`${env.logLabel}: undo lookup failed`, error.code)
    return env.sendReply(waId, REPLY_UNDO_FAILED)
  }
  const row = data as { transaction_id: string } | null
  if (!row) return env.sendReply(waId, REPLY_UNDO_NONE)

  // whatsapp_expense_log.transaction_id cascades on delete: removing the transaction removes the log row too.
  const { error: deleteError } = await env.admin.from('transactions').delete().eq('id', row.transaction_id)
  if (deleteError) {
    console.error(`${env.logLabel}: undo delete failed`, deleteError.code)
    return env.sendReply(waId, REPLY_UNDO_FAILED)
  }
  return env.sendReply(waId, REPLY_UNDO_DONE)
}

async function handleExpenseMessage(
  env: ExpenseEnv,
  anthropicKey: string,
  userId: string,
  message: ExpenseMessage,
): Promise<void> {
  // Idempotency: a retried delivery (Meta resends when it does not get a timely 200; Twilio retries on timeout/5xx
  // too) must never be processed twice. A row already logged for this wamid means this exact message was already
  // turned into a transaction (or attempted).
  const already = await env.admin
    .from('whatsapp_expense_log')
    .select('id', { count: 'exact', head: true })
    .eq('wamid', message.wamid)
  if (already.error) console.error(`${env.logLabel}: idempotency check failed`, already.error.code)
  if ((already.count ?? 0) > 0) return

  const quota = await env.admin.rpc('consume_ai_quota_for', {
    p_user: userId,
    p_feature: WHATSAPP_EXPENSE_FEATURE,
    p_daily_limit: WHATSAPP_EXPENSE_DAILY_LIMIT,
  })
  if (quota.error) {
    const kind = classifyQuotaError(quota.error)
    if (kind === 'plus_required') return env.sendReply(message.waId, REPLY_PLUS_REQUIRED)
    if (kind === 'quota_exceeded') return env.sendReply(message.waId, REPLY_QUOTA_EXCEEDED)
    console.error(`${env.logLabel}: quota check failed`, quota.error.code)
    return env.sendReply(message.waId, REPLY_MODEL_UNAVAILABLE)
  }

  // From here on the use is charged and is never given back (same rule as parse-movements, see docs/SPRINT_6.md).
  const [categoriesResult, accountsResult] = await Promise.all([
    env.admin
      .from('categories')
      .select('id, name, kind')
      .eq('owner_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
    env.admin
      .from('accounts')
      .select('id, name')
      .eq('owner_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
  ])
  if (categoriesResult.error || accountsResult.error) {
    console.error(`${env.logLabel}: could not load categories/accounts`)
    return env.sendReply(message.waId, REPLY_MODEL_UNAVAILABLE)
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
    env.logLabel,
  )
  const extracted = modelResponse === null ? null : extractToolInput(modelResponse)
  if (!extracted || !extracted.ok) {
    if (extracted) console.error(`${env.logLabel}: unusable model response`, extracted.reason)
    return env.sendReply(message.waId, REPLY_MODEL_UNAVAILABLE)
  }

  const result = validateModelOutput(extracted.input, { today, categories, accounts })
  if (result.movements.length === 0) {
    return env.sendReply(message.waId, REPLY_NO_AMOUNT)
  }

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name] as const))
  const confirmed: ConfirmedMovement[] = []
  for (const movement of result.movements) {
    const categoryId = movement.categoryId ?? pickFallbackCategoryId(categories, movement.kind)
    const accountId = movement.accountId
    if (!categoryId || !accountId) continue // no category/account of that kind exists at all (past onboarding, never happens)

    const { data: inserted, error: insertError } = await env.admin
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
      console.error(`${env.logLabel}: transaction insert failed`, insertError?.code)
      continue
    }
    const { error: logError } = await env.admin.from('whatsapp_expense_log').insert({
      wamid: message.wamid,
      user_id: userId,
      transaction_id: (inserted as { id: string }).id,
    })
    if (logError) console.error(`${env.logLabel}: expense log insert failed`, logError.code)
    confirmed.push({ movement, categoryName: categoryNameById.get(categoryId) ?? 'Otros' })
  }

  if (confirmed.length === 0) {
    return env.sendReply(message.waId, REPLY_NO_DESTINATION)
  }
  return env.sendReply(message.waId, formatConfirmationReply(confirmed))
}

/** The one entry point both transports call: decides what a linked number's message means and acts on it. */
export async function processInboundMessage(env: ExpenseEnv, message: ExpenseMessage): Promise<void> {
  try {
    const userId = await findLinkedUser(env.admin, message.waId)
    if (!userId) {
      await env.sendReply(message.waId, REPLY_NOT_LINKED)
      return
    }
    if (isUndoCommand(message.body ?? '')) {
      return await handleUndo(env, userId, message.waId)
    }
    if (message.body === null) {
      await env.sendReply(message.waId, REPLY_NO_TEXT)
      return
    }
    if (!env.anthropicKey) {
      console.error(`${env.logLabel}: missing ANTHROPIC_API_KEY, cannot process linked message`)
      await env.sendReply(message.waId, REPLY_MODEL_UNAVAILABLE)
      return
    }
    await handleExpenseMessage(env, env.anthropicKey, userId, message)
  } catch (error) {
    // One message's failure must never take down the rest of a batch or the webhook's 200 to the provider.
    console.error(`${env.logLabel}: message handling failed`, error instanceof Error ? error.name : 'unknown')
  }
}
