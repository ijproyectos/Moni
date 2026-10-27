import {
  cleanCodeInput,
  groupFormSchema,
  joinGroupSchema,
  normalizeInviteCode,
  parsePercentInput,
  settlementFormSchema,
  sharedExpenseFormSchema,
} from './group'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe('groupFormSchema', () => {
  it('trims the name and validates the kind', () => {
    expect(groupFormSchema.parse({ name: '  Casa  ', kind: 'casa' })).toEqual({
      name: 'Casa',
      kind: 'casa',
    })
    expect(groupFormSchema.safeParse({ name: '   ', kind: 'casa' }).success).toBe(false)
    expect(groupFormSchema.safeParse({ name: 'x'.repeat(61), kind: 'casa' }).success).toBe(false)
    expect(groupFormSchema.safeParse({ name: 'Ok', kind: 'hotel' }).success).toBe(false)
  })
})

describe('invite codes', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeInviteCode(' abcd 2345 wxyz ')).toBe('ABCD2345WXYZ')
  })

  it('rejects ambiguous characters and wrong lengths', () => {
    expect(joinGroupSchema.safeParse({ code: 'abcd2345wxyz' }).success).toBe(true)
    expect(joinGroupSchema.safeParse({ code: 'ABCDEFGHJKL0' }).success).toBe(false)
    expect(joinGroupSchema.safeParse({ code: 'ABCDEFGHJKLI' }).success).toBe(false)
    expect(joinGroupSchema.safeParse({ code: 'ABC' }).success).toBe(false)
    expect(joinGroupSchema.safeParse({ code: 'ABCD2345' }).success).toBe(false)
  })
})

describe('parsePercentInput', () => {
  it('accepts comma or dot with up to 2 decimals', () => {
    expect(parsePercentInput('33,34')).toBe(33.34)
    expect(parsePercentInput('50 %')).toBe(50)
    expect(parsePercentInput('0')).toBeNull()
    expect(parsePercentInput('100,5')).toBeNull()
    expect(parsePercentInput('12,345')).toBeNull()
    expect(parsePercentInput('abc')).toBeNull()
  })
})

describe('sharedExpenseFormSchema', () => {
  const base = {
    amount: '1.234,50',
    description: ' Cena ',
    occurredOn: '2026-10-05',
    paidBy: A,
    splitMethod: 'equal' as const,
    participants: [A, B],
  }

  it('turns the amount into cents and trims text', () => {
    const parsed = sharedExpenseFormSchema.parse(base)
    expect(parsed.amount).toBe(123450)
    expect(parsed.description).toBe('Cena')
    expect(parsed.percentValues).toBeNull()
    expect(parsed.templateSlug).toBeNull()
    expect(parsed.payerAccountId).toBeNull()
  })

  it('rejects zero amounts, blank descriptions, and empty or repeated participants', () => {
    expect(sharedExpenseFormSchema.safeParse({ ...base, amount: '0' }).success).toBe(false)
    expect(sharedExpenseFormSchema.safeParse({ ...base, description: '  ' }).success).toBe(false)
    expect(sharedExpenseFormSchema.safeParse({ ...base, participants: [] }).success).toBe(false)
    expect(sharedExpenseFormSchema.safeParse({ ...base, participants: [A, A] }).success).toBe(false)
  })

  it('aligns percentages with participants and requires them to add up to 100', () => {
    const percent = { ...base, splitMethod: 'percent' as const }
    const ok = sharedExpenseFormSchema.parse({ ...percent, percents: { [A]: '60', [B]: '40' } })
    expect(ok.percentValues).toEqual([60, 40])
    expect(
      sharedExpenseFormSchema.safeParse({ ...percent, percents: { [A]: '60', [B]: '30' } }).success,
    ).toBe(false)
    expect(
      sharedExpenseFormSchema.safeParse({ ...percent, percents: { [A]: '100' } }).success,
    ).toBe(false)
  })
})

describe('settlementFormSchema', () => {
  it('parses amount to cents and an empty note to null', () => {
    const parsed = settlementFormSchema.parse({
      toUser: B,
      amount: '83,34',
      occurredOn: '2026-10-10',
      note: '',
    })
    expect(parsed.amount).toBe(8334)
    expect(parsed.note).toBeNull()
    expect(parsed.accountId).toBeNull()
  })
})

describe('cleanCodeInput', () => {
  it('uppercases and strips spaces and dashes, capped at 12 characters', () => {
    expect(cleanCodeInput('abcd-2345-wxyz')).toBe('ABCD2345WXYZ')
    expect(cleanCodeInput(' ab cd 23 45 wx yz 67')).toBe('ABCD2345WXYZ')
  })
})
