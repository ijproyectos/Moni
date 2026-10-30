// Orchestration of the plus-subscription actions, with every side effect injected (no Deno / npm imports, so
// Vitest runs it from Node with fakes). index.ts wires the real Supabase and Mercado Pago clients.
//
// Logs carry only error codes and HTTP statuses, never Mercado Pago bodies, ids or tokens.

import { cancelWithFallback } from '../_shared/mpCancel.ts'
import {
  ACTION_THROTTLED,
  type ApiFailure,
  buildPreapprovalBody,
  canTransition,
  classifyMpFailure,
  classifyRpcError,
  isMercadoPagoInitPoint,
  LIFECYCLE,
  type LifecycleAction,
  parsePreapproval,
  pickCurrentSubscription,
  preapprovalUrl,
  publicState,
  selectCancelTargets,
  selectStalePending,
  SYNC_MIN_SECONDS,
  type SubscriptionRow,
  type SubscriptionStatus,
  WRITE_MIN_SECONDS,
} from './lib.ts'

export interface MpResult {
  status: number // 0 = network error or timeout
  json: unknown | null
}

interface DbError {
  code?: string
  message?: string
}

export interface ActionDeps {
  mp: (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) => Promise<MpResult>
  startSubscription: (
    userId: string,
    externalReference: string,
  ) => Promise<{ data: string | null; error: DbError | null }>
  setStatus: (
    subscriptionId: string,
    status: SubscriptionStatus,
    preapprovalId?: string,
  ) => Promise<{ error: DbError | null }>
  claim: (
    userId: string,
    subscriptionId: string,
    kind: 'sync' | 'write',
    minSeconds: number,
  ) => Promise<{ data: boolean | null; error: DbError | null }>
  listRows: (userId: string) => Promise<{ data: SubscriptionRow[] | null; error: DbError | null }>
  newReference: () => string
  log: (message: string, detail?: string | number) => void
}

export interface ActionResult {
  http: number
  body: Record<string, unknown>
}

const fail = (failure: ApiFailure): ActionResult => ({
  http: failure.http,
  body: { error: failure.code },
})
const ok = (body: Record<string, unknown>): ActionResult => ({ http: 200, body })
const serverError = (): ActionResult => fail({ http: 500, code: 'server_error' })
const isSuccess = (status: number) => status >= 200 && status < 300

/** Cancels a preapproval on Mercado Pago (spelling fallback included). Returns the final HTTP status. */
async function cancelOnMp(deps: ActionDeps, preapprovalId: string): Promise<number> {
  const result = await cancelWithFallback((mpStatus) =>
    deps.mp('PUT', preapprovalUrl(preapprovalId), { status: mpStatus }),
  )
  return result.status
}

/** Marks a row cancelled; a failure is logged and swallowed (the webhook / next action reconciles). */
async function markCancelled(deps: ActionDeps, subscriptionId: string, label: string) {
  const { error } = await deps.setStatus(subscriptionId, 'cancelled')
  if (error) deps.log(`${label}: could not mark cancelled`, error.code ?? 'unknown')
}

// ---------------------------------------------------------------------------------------------------------
// create

export async function createSubscription(
  deps: ActionDeps,
  input: { userId: string; payerEmail: string; backUrl: string },
): Promise<ActionResult> {
  const externalReference = deps.newReference()
  // start_plus_subscription refuses an authorized or paused subscription (already_subscribed) and a checkout
  // created in the last 60 seconds (create_throttled).
  const started = await deps.startSubscription(input.userId, externalReference)
  if (started.error || !started.data) {
    const failure = classifyRpcError(started.error)
    if (failure.http === 500) deps.log('start failed', started.error?.code ?? 'unknown')
    return fail(failure)
  }
  const subscriptionId = started.data

  // Older abandoned checkouts of this user could still be completed later and bill twice: cancel them first.
  // Best effort: a failure here is logged and creation proceeds (the webhook duplicate guard is the backstop).
  const listed = await deps.listRows(input.userId)
  if (listed.error) {
    deps.log('could not list previous checkouts', listed.error.code ?? 'unknown')
  } else {
    for (const stale of selectStalePending(listed.data ?? [], subscriptionId)) {
      const status = await cancelOnMp(deps, stale.preapproval_id as string)
      if (isSuccess(status)) {
        await markCancelled(deps, stale.id, 'stale pending')
      } else {
        deps.log('stale pending cancel failed on mercado pago', status)
      }
    }
  }

  // The one place a preapproval is created: POST https://api.mercadopago.com/preapproval
  const created = await deps.mp(
    'POST',
    'https://api.mercadopago.com/preapproval',
    buildPreapprovalBody({
      externalReference,
      payerEmail: input.payerEmail,
      backUrl: input.backUrl,
    }),
  )
  if (!isSuccess(created.status)) {
    await markCancelled(deps, subscriptionId, 'create failed')
    return fail(classifyMpFailure(created.status))
  }
  const preapproval = parsePreapproval(created.json)
  if (!preapproval || !isMercadoPagoInitPoint(preapproval.initPoint)) {
    deps.log('unusable preapproval response')
    await markCancelled(deps, subscriptionId, 'unusable response')
    return fail({ http: 502, code: 'payment_provider_error' })
  }

  let stored = await deps.setStatus(subscriptionId, preapproval.status ?? 'pending', preapproval.id)
  if (stored.error) {
    deps.log('could not store preapproval, retrying once', stored.error.code ?? 'unknown')
    stored = await deps.setStatus(subscriptionId, preapproval.status ?? 'pending', preapproval.id)
  }
  if (stored.error) {
    deps.log('could not store preapproval', stored.error.code ?? 'unknown')
    // The preapproval exists on Mercado Pago but we cannot track it: cancel it so it cannot bill unseen.
    const status = await cancelOnMp(deps, preapproval.id)
    if (!isSuccess(status)) deps.log('orphan preapproval cancel failed on mercado pago', status)
    await markCancelled(deps, subscriptionId, 'orphan')
    return serverError()
  }
  return ok({ init_point: preapproval.initPoint, status: 'pending' })
}

// ---------------------------------------------------------------------------------------------------------
// get / pause / reactivate / cancel

export async function runUserAction(
  deps: ActionDeps,
  input: { userId: string; action: 'get' | LifecycleAction },
): Promise<ActionResult> {
  const listed = await deps.listRows(input.userId)
  if (listed.error) {
    deps.log('could not load subscriptions', listed.error.code ?? 'unknown')
    return serverError()
  }
  const rows = listed.data ?? []
  const current = pickCurrentSubscription(rows)

  if (input.action === 'get') {
    // Best-effort reconciliation with Mercado Pago, in case a notification is late. At most once per
    // SYNC_MIN_SECONDS per subscription; otherwise (or on any failure) the stored state is returned.
    if (current && current.preapproval_id && current.status !== 'cancelled') {
      const claim = await deps.claim(input.userId, current.id, 'sync', SYNC_MIN_SECONDS)
      if (claim.error) deps.log('sync claim failed', claim.error.code ?? 'unknown')
      if (!claim.error && claim.data === true) {
        const live = await deps.mp('GET', preapprovalUrl(current.preapproval_id))
        const resource = live.status === 200 ? parsePreapproval(live.json) : null
        if (resource?.status && resource.status !== current.status) {
          const synced = await deps.setStatus(current.id, resource.status)
          if (!synced.error) current.status = resource.status
        }
      }
    }
    return ok(publicState(current))
  }

  const action = input.action
  if (!rows.some((r) => r.preapproval_id !== null)) {
    return fail({ http: 404, code: 'subscription_not_found' })
  }
  const targets = action === 'cancel' ? selectCancelTargets(rows) : []
  if (
    action === 'cancel' ? targets.length === 0 : !current || !canTransition(action, current.status)
  ) {
    return fail({ http: 409, code: 'invalid_transition' })
  }
  const anchor =
    action === 'cancel' ? (targets[0] as SubscriptionRow) : (current as SubscriptionRow)

  // At most one Mercado Pago write per WRITE_MIN_SECONDS per user.
  const claim = await deps.claim(input.userId, anchor.id, 'write', WRITE_MIN_SECONDS)
  if (claim.error) {
    deps.log('write claim failed', claim.error.code ?? 'unknown')
    return serverError()
  }
  if (claim.data !== true) return fail(ACTION_THROTTLED)

  if (action === 'cancel') {
    // Cancels EVERY non-cancelled row: a leftover pending / paused row must not survive and bill later.
    let firstFailure: number | null = null
    for (const row of targets) {
      if (row.preapproval_id) {
        const status = await cancelOnMp(deps, row.preapproval_id)
        if (!isSuccess(status)) {
          firstFailure ??= status
          continue
        }
      }
      await markCancelled(deps, row.id, 'cancel')
    }
    if (firstFailure !== null) return fail(classifyMpFailure(firstFailure))
    return ok({ status: 'cancelled' })
  }

  const row = current as SubscriptionRow
  const rule = LIFECYCLE[action]
  const updated = await deps.mp('PUT', preapprovalUrl(row.preapproval_id as string), {
    status: rule.mpStatus,
  })
  if (!isSuccess(updated.status)) return fail(classifyMpFailure(updated.status))
  const nextStatus = parsePreapproval(updated.json)?.status ?? rule.to
  const synced = await deps.setStatus(row.id, nextStatus)
  if (synced.error) {
    // Mercado Pago already changed; the webhook will bring the row in line. Report success of the action.
    deps.log('could not sync status', synced.error.code ?? 'unknown')
  }
  return ok({ status: nextStatus })
}
