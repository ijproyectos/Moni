import {
  addsToBalance,
  signedAmount,
  transactionFormSchema,
  transferFormSchema,
} from './transaction'
import { makeTransaction } from './testing'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

describe('transactionFormSchema', () => {
  const valid = {
    kind: 'expense',
    accountId: ID_A,
    categoryId: ID_B,
    amount: '1.234,50',
    occurredOn: '2026-10-10',
    note: '  Almuerzo ',
  }

  it('converts the amount to cents and trims the note', () => {
    const parsed = transactionFormSchema.parse(valid)
    expect(parsed.amount).toBe(123450)
    expect(parsed.note).toBe('Almuerzo')
  })

  it('turns an empty note into null', () => {
    expect(transactionFormSchema.parse({ ...valid, note: '' }).note).toBeNull()
    expect(transactionFormSchema.parse({ ...valid, note: undefined }).note).toBeNull()
  })

  it('rejects zero, malformed amounts, bad dates and long notes', () => {
    expect(transactionFormSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false)
    expect(transactionFormSchema.safeParse({ ...valid, amount: 'abc' }).success).toBe(false)
    expect(transactionFormSchema.safeParse({ ...valid, occurredOn: '2026-02-30' }).success).toBe(
      false,
    )
    expect(transactionFormSchema.safeParse({ ...valid, note: 'x'.repeat(201) }).success).toBe(false)
  })

  it('does not allow reserved kinds from the form', () => {
    expect(transactionFormSchema.safeParse({ ...valid, kind: 'settlement_out' }).success).toBe(
      false,
    )
  })
})

describe('transferFormSchema', () => {
  it('requires different accounts', () => {
    const result = transferFormSchema.safeParse({
      fromAccountId: ID_A,
      toAccountId: ID_A,
      amount: '100',
      occurredOn: '2026-10-10',
    })
    expect(result.success).toBe(false)
  })
})

describe('signedAmount', () => {
  it('signs income and expense and ignores voided or reserved kinds', () => {
    expect(signedAmount(makeTransaction({ kind: 'income' }))).toBe(10000)
    expect(signedAmount(makeTransaction({ kind: 'expense' }))).toBe(-10000)
    expect(signedAmount(makeTransaction({ status: 'voided' }))).toBe(0)
    expect(signedAmount(makeTransaction({ kind: 'shared_payment' }))).toBe(0)
  })
})

describe('addsToBalance', () => {
  it('matches the database rule for what raises an account balance', () => {
    expect(addsToBalance('income')).toBe(true)
    expect(addsToBalance('settlement_in')).toBe(true)
    expect(addsToBalance('adjustment_in')).toBe(true)
    for (const kind of ['expense', 'shared_payment', 'settlement_out', 'adjustment_out']) {
      expect(addsToBalance(kind)).toBe(false)
    }
  })
})
