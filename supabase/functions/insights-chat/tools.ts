// Executors of the READ-ONLY tools of insights-chat. They receive a Supabase client built from the CALLER's JWT
// and the anon key (so RLS isolates the data); the service role is never used. No npm imports here: the client
// is typed structurally so Vitest can drive these with a fake.

import {
  addDays,
  buildDues,
  escapeLike,
  LIMITS,
  parseToolInput,
  serializeToolResult,
  shapeAnts,
  shapeGroupBalances,
  shapePeriodSummary,
  shapeTransactions,
  summarizeInstallments,
  summarizeSubscriptions,
  toDueItems,
  type ToolRunResult,
} from './lib.ts'

export interface DbResult {
  data: unknown
  error: { code?: string | null; message?: string | null } | null
  count?: number | null
}

export interface DbQuery extends PromiseLike<DbResult> {
  select(columns: string, options?: { count?: 'exact' }): DbQuery
  eq(column: string, value: unknown): DbQuery
  in(column: string, values: unknown[]): DbQuery
  gt(column: string, value: unknown): DbQuery
  gte(column: string, value: unknown): DbQuery
  lte(column: string, value: unknown): DbQuery
  ilike(column: string, pattern: string): DbQuery
  not(column: string, operator: string, value: unknown): DbQuery
  or(filters: string): DbQuery
  order(column: string, options?: { ascending?: boolean }): DbQuery
  limit(count: number): DbQuery
  range(from: number, to: number): DbQuery
}

export interface Db {
  from(table: string): DbQuery
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult>
}

export interface ToolContext {
  today: string
  /** `sub` of the caller's JWT; only used to mark "me" in group balances. */
  userId: string | null
}

class ToolDbError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

function check(result: DbResult): unknown {
  if (result.error) throw new ToolDbError(result.error.code ?? 'db_error')
  return result.data
}

/**
 * Future installment rows (dated today or later, the app's "still to pay" rule), paged so totals are exact up to
 * installmentPageSize * installmentMaxPages rows. PostgREST caps a response at its max_rows (1000 by default in
 * Supabase), hence the page size. Reaching the ceiling with a full last page reports `truncated`.
 */
async function fetchFutureInstallments(
  db: Db,
  today: string,
): Promise<{ rows: unknown[]; truncated: boolean }> {
  const size = LIMITS.installmentPageSize
  const rows: unknown[] = []
  for (let page = 0; page < LIMITS.installmentMaxPages; page++) {
    const data = check(
      await db
        .from('transactions')
        .select('installment_plan_id, occurred_on, amount')
        .eq('status', 'posted')
        .not('installment_plan_id', 'is', null)
        .gte('occurred_on', today)
        .order('occurred_on')
        .order('id')
        .range(page * size, page * size + size - 1),
    )
    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)
    if (batch.length < size) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

/** Runs one tool call. Never throws and never returns raw database messages: the model gets short codes only. */
export async function executeTool(
  db: Db,
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolRunResult> {
  const parsed = parseToolInput(name, rawInput, ctx.today)
  if (!parsed.ok) return { content: parsed.error, isError: true }
  try {
    const args = parsed.args
    switch (args.name) {
      case 'get_period_summary': {
        // The RPC takes an exclusive end date.
        const data = check(
          await db.rpc('get_period_summary', { p_from: args.from, p_to: addDays(args.to, 1) }),
        )
        return serializeToolResult(shapePeriodSummary(data, args.from, args.to))
      }
      case 'list_transactions': {
        const filtered = args.category !== null
        let query = db
          .from('transactions')
          .select(
            `occurred_on, kind, amount, note, ${filtered ? 'categories!inner(name)' : 'categories(name)'}, accounts(name)`,
            { count: 'exact' },
          )
          .eq('status', 'posted')
          .in('kind', args.type ? [args.type] : ['expense', 'income'])
          .gte('occurred_on', args.from)
          .lte('occurred_on', args.to)
        if (args.category !== null) {
          query = query.ilike('categories.name', `%${escapeLike(args.category)}%`)
        }
        if (args.minAmount !== null) query = query.gte('amount', args.minAmount)
        if (args.maxAmount !== null) query = query.lte('amount', args.maxAmount)
        const result = await query
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(args.limit)
        const data = check(result)
        return serializeToolResult(shapeTransactions(data, result.count ?? null, args.limit, ctx.today))
      }
      case 'get_upcoming_dues': {
        const horizon = addDays(ctx.today, args.days)
        const overdueFrom = addDays(ctx.today, -LIMITS.overdueWindowDays)
        const [occurrences, fixed, subs, installments] = await Promise.all([
          db
            .from('fixed_expense_occurrences')
            // !inner + parent filter: pausing a fixed expense keeps its pending occurrences, they are not due.
            .select('due_on, rescheduled_to, expected_amount, fixed_expenses!inner(name, status)')
            .eq('status', 'pending')
            .eq('fixed_expenses.status', 'active')
            // Effective date (rescheduled_to if set, else due_on) inside [overdueFrom, horizon]; the limit comes after.
            .or(
              `and(rescheduled_to.is.null,due_on.gte.${overdueFrom},due_on.lte.${horizon}),and(rescheduled_to.gte.${overdueFrom},rescheduled_to.lte.${horizon})`,
            )
            .order('due_on')
            .limit(200),
          db
            .from('fixed_expenses')
            .select('name, amount, next_due_on')
            .eq('status', 'active')
            .gte('next_due_on', overdueFrom)
            .lte('next_due_on', horizon)
            .order('next_due_on')
            .limit(60),
          db
            .from('subscriptions')
            .select('name, amount, next_charge_on')
            .eq('status', 'active')
            .gte('next_charge_on', overdueFrom)
            .lte('next_charge_on', horizon)
            .order('next_charge_on')
            .limit(60),
          db
            .from('transactions')
            .select('occurred_on, amount, installment_number, installments_total, installment_plan_id')
            .eq('status', 'posted')
            .eq('kind', 'expense')
            .not('installment_plan_id', 'is', null)
            .gte('occurred_on', ctx.today) // dated today = not yet charged (same rule as the app)
            .lte('occurred_on', horizon)
            .order('occurred_on')
            .limit(60),
        ])
        const installmentRows = check(installments)
        const planIds = [
          ...new Set(
            (Array.isArray(installmentRows) ? installmentRows : [])
              .map((r) => (r as { installment_plan_id?: unknown }).installment_plan_id)
              .filter((id): id is string => typeof id === 'string'),
          ),
        ]
        const planNames = new Map<string, string>()
        if (planIds.length > 0) {
          const plans = check(await db.from('installment_plans').select('id, description').in('id', planIds))
          for (const p of Array.isArray(plans) ? plans : []) {
            const { id, description } = p as { id?: unknown; description?: unknown }
            if (typeof id === 'string' && typeof description === 'string') planNames.set(id, description)
          }
        }
        const items = toDueItems({
          occurrences: check(occurrences),
          fixedExpenses: check(fixed),
          subscriptions: check(subs),
          installments: installmentRows,
          planNames,
          horizon,
          overdueFrom,
        })
        return serializeToolResult(buildDues(items, ctx.today, args.days))
      }
      case 'get_installments': {
        const { rows, truncated: rowsCut } = await fetchFutureInstallments(db, ctx.today)
        // Plans come from the plan ids present in the future rows (not "the latest N plans").
        const allIds = [
          ...new Set(
            rows
              .map((r) => (r as { installment_plan_id?: unknown }).installment_plan_id)
              .filter((id): id is string => typeof id === 'string'),
          ),
        ]
        const plansCut = allIds.length > LIMITS.installmentMaxPlans
        const ids = allIds.slice(0, LIMITS.installmentMaxPlans)
        const plans: unknown[] = []
        for (let i = 0; i < ids.length; i += LIMITS.installmentPlanChunk) {
          const chunk = ids.slice(i, i + LIMITS.installmentPlanChunk)
          const data = check(
            await db
              .from('installment_plans')
              .select('id, description, installments_count, purchase_on')
              .eq('status', 'posted')
              .in('id', chunk),
          )
          if (Array.isArray(data)) plans.push(...data)
        }
        return serializeToolResult(
          summarizeInstallments(plans, rows, ctx.today, { truncated: rowsCut || plansCut }),
        )
      }
      case 'get_subscriptions': {
        const data = check(
          await db
            .from('subscriptions')
            .select('name, plan, amount, period, next_charge_on, status')
            .in('status', ['active', 'paused'])
            .order('next_charge_on')
            .limit(60),
        )
        return serializeToolResult(summarizeSubscriptions(data))
      }
      case 'get_group_balances': {
        const groups = check(await db.rpc('get_my_groups'))
        const list = (Array.isArray(groups) ? groups : []).slice(0, LIMITS.maxGroups)
        const balances = new Map<string, unknown>()
        await Promise.all(
          list.map(async (g) => {
            const id = (g as { id?: unknown }).id
            if (typeof id !== 'string') return
            balances.set(id, check(await db.rpc('get_group_balances', { p_group: id })))
          }),
        )
        return serializeToolResult(shapeGroupBalances(list, balances, ctx.userId))
      }
      case 'get_small_expenses': {
        const data = check(
          await db.rpc('get_ant_expenses', { p_month: args.month, p_max_amount: args.threshold }),
        )
        return serializeToolResult(shapeAnts(data))
      }
    }
  } catch (error) {
    // Only a short code: database messages could carry data and are never shown to the model or the client.
    console.error('insights-chat: tool failed', name, error instanceof ToolDbError ? error.code : 'unknown')
    return { content: 'tool_failed: could not read that data right now', isError: true }
  }
}
