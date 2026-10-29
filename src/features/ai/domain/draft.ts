import { z } from 'zod'
import { formatAmountInput } from '@/shared/lib/amountInput'
import {
  transactionFormSchema,
  type EntryKind,
  type TransactionFormValues,
} from '@/features/transactions/domain/transaction'

/** Items the model is less sure about than this are highlighted in the confirmation list. */
export const LOW_CONFIDENCE = 0.7

/** Shape returned by the parse-movements Edge Function (already validated and mapped to the caller's ids). */
export const parseResponseSchema = z.object({
  movements: z.array(
    z.object({
      kind: z.enum(['expense', 'income']),
      amountCents: z.number().int().positive(),
      note: z.string().nullable(),
      categoryId: z.string().nullable(),
      accountId: z.string().nullable(),
      occurredOn: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  warnings: z.array(z.object({ code: z.string(), index: z.number().optional() })).default([]),
})

export type ParseResponse = z.output<typeof parseResponseSchema>
export type ParsedMovement = ParseResponse['movements'][number]

/** One editable row of the confirmation list. `amount` is the text the person edits (es-AR). */
export interface DraftMovement {
  key: string
  kind: EntryKind
  amount: string
  note: string
  categoryId: string
  accountId: string
  occurredOn: string
  confidence: number
  /** The model named an account that is not in the person's list; the default account was used instead. */
  accountUnmatched: boolean
}

export function toDrafts(response: ParseResponse, defaultAccountId: string): DraftMovement[] {
  // `account_unmatched` warnings carry the position of the movement in the response.
  const unmatched = new Set(
    response.warnings.filter((w) => w.code === 'account_unmatched').map((w) => w.index),
  )
  return response.movements.map((m, index) => ({
    key: `draft-${index}`,
    kind: m.kind,
    amount: formatAmountInput(m.amountCents),
    note: m.note ?? '',
    categoryId: m.categoryId ?? '',
    accountId: m.accountId ?? defaultAccountId,
    occurredOn: m.occurredOn,
    confidence: m.confidence,
    accountUnmatched: unmatched.has(index),
  }))
}

/** A draft needs a second look when the model was unsure or could not pick a category. */
export function needsReview(draft: DraftMovement): boolean {
  return draft.confidence < LOW_CONFIDENCE || draft.categoryId === '' || draft.accountUnmatched
}

export type DraftValidation =
  { ok: true; values: TransactionFormValues } | { ok: false; message: string }

/** Same rules as the manual form: amount in integer cents, category and account required, valid date. */
export function validateDraft(draft: DraftMovement): DraftValidation {
  const parsed = transactionFormSchema.safeParse({
    kind: draft.kind,
    accountId: draft.accountId,
    categoryId: draft.categoryId,
    amount: draft.amount,
    occurredOn: draft.occurredOn,
    note: draft.note,
  })
  if (parsed.success) return { ok: true, values: parsed.data }
  return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revisá este movimiento.' }
}
