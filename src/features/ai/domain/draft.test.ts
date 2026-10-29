import { needsReview, toDrafts, validateDraft, type DraftMovement } from './draft'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const CATEGORY = '22222222-2222-4222-8222-222222222222'

function draft(overrides: Partial<DraftMovement> = {}): DraftMovement {
  return {
    key: 'draft-0',
    kind: 'expense',
    amount: '5.000',
    note: 'Colectivo',
    categoryId: CATEGORY,
    accountId: ACCOUNT,
    occurredOn: '2026-10-28',
    confidence: 0.9,
    accountUnmatched: false,
    ...overrides,
  }
}

describe('draft domain', () => {
  it('maps the response to editable drafts with an es-AR amount and a default account', () => {
    const drafts = toDrafts(
      {
        movements: [
          {
            kind: 'income',
            amountCents: 123_450,
            note: null,
            categoryId: null,
            accountId: null,
            occurredOn: '2026-10-28',
            confidence: 0.5,
          },
        ],
        warnings: [],
      },
      ACCOUNT,
    )
    expect(drafts[0]).toMatchObject({
      amount: '1.234,50',
      note: '',
      categoryId: '',
      accountId: ACCOUNT,
    })
  })

  it('marks drafts whose account was not matched, by movement position', () => {
    const movement = {
      kind: 'expense' as const,
      amountCents: 500_000,
      note: null,
      categoryId: CATEGORY,
      accountId: ACCOUNT,
      occurredOn: '2026-10-28',
      confidence: 0.9,
    }
    const drafts = toDrafts(
      {
        movements: [movement, movement],
        warnings: [{ code: 'account_unmatched', index: 1 }],
      },
      ACCOUNT,
    )
    expect(drafts.map((d) => d.accountUnmatched)).toEqual([false, true])
    expect(needsReview(drafts[1] as DraftMovement)).toBe(true)
  })

  it('flags low confidence and missing category for review', () => {
    expect(needsReview(draft())).toBe(false)
    expect(needsReview(draft({ confidence: 0.69 }))).toBe(true)
    expect(needsReview(draft({ categoryId: '' }))).toBe(true)
  })

  it('validates with the manual form rules and converts to integer cents', () => {
    const result = validateDraft(draft({ amount: '12.345,50' }))
    expect(result).toMatchObject({ ok: true, values: { amount: 1_234_550, note: 'Colectivo' } })
    expect(validateDraft(draft({ amount: '0' })).ok).toBe(false)
    expect(validateDraft(draft({ categoryId: '' })).ok).toBe(false)
    expect(validateDraft(draft({ accountId: '' })).ok).toBe(false)
    expect(validateDraft(draft({ occurredOn: '2026-02-30' })).ok).toBe(false)
  })
})
