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
        const [occurrences, fixed, subs, installments] = await Promise.all([
          db
            .from('fixed_expense_occurrences')
            .select('due_on, rescheduled_to, expected_amount, fixed_expenses(name)')
            .eq('status', 'pending')
            .or(`due_on.lte.${horizon},rescheduled_to.lte.${horizon}`)
            .order('due_on')
            .limit(60),
          db
            .from('fixed_expenses')
            .select('name, amount, next_due_on')
            .eq('status', 'active')
            .lte('next_due_on', horizon)
            .order('next_due_on')
            .limit(60),
          db
            .from('subscriptions')
            .select('name, amount, next_charge_on')
            .eq('status', 'active')
            .lte('next_charge_on', horizon)
            .order('next_charge_on')
            .limit(60),
          db
            .from('transactions')
            .select('occurred_on, amount, installment_number, installments_total, installment_plan_id')
            .eq('status', 'posted')
            .eq('kind', 'expense')
            .not('installment_plan_id', 'is', null)
            .gte('occurred_on', ctx.today)
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
        })
        return serializeToolResult(buildDues(items, ctx.today, args.days))
      }
      case 'get_installments': {
        const [plans, future] = await Promise.all([
          db
            .from('installment_plans')
            .select('id, description, installments_count, purchase_on')
            .eq('status', 'posted')
            .order('purchase_on', { ascending: false })
            .limit(50),
          db
            .from('transactions')
            .select('installment_plan_id, occurred_on, amount')
            .eq('status', 'posted')
            .not('installment_plan_id', 'is', null)
            .gt('occurred_on', ctx.today)
            .order('occurred_on')
            .limit(1000),
        ])
        return serializeToolResult(summarizeInstallments(check(plans), check(future), ctx.today))
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
