import {
  accountFormSchema,
  adjustmentTarget,
  availableBalance,
  availableCredit,
  canHoldTransferData,
  cardDebt,
  hasTransferData,
  parseSignedAmount,
  transferDataSchema,
  transferLines,
  type Account,
} from './account'
import { makeAccount } from './testing'

const account = (overrides: Partial<Account>): Account => makeAccount(overrides)

describe('accountFormSchema', () => {
  it('converts the opening balance to cents', () => {
    const parsed = accountFormSchema.parse({
      name: ' Caja ',
      kind: 'cash',
      openingBalance: '1.500,50',
    })
    expect(parsed).toEqual({
      name: 'Caja',
      kind: 'cash',
      openingBalance: 150050,
      creditLimit: null,
      closingDay: null,
      dueDay: null,
    })
  })

  it('defaults an empty opening balance to zero', () => {
    expect(
      accountFormSchema.parse({ name: 'Caja', kind: 'bank', openingBalance: '' }).openingBalance,
    ).toBe(0)
  })

  it('rejects invalid amounts and empty names', () => {
    expect(
      accountFormSchema.safeParse({ name: 'Caja', kind: 'bank', openingBalance: 'abc' }).success,
    ).toBe(false)
    expect(
      accountFormSchema.safeParse({ name: '  ', kind: 'bank', openingBalance: '0' }).success,
    ).toBe(false)
  })
})

describe('availableBalance', () => {
  it('ignores archived accounts', () => {
    const total = availableBalance([
      account({ balanceCents: 1000 }),
      account({ balanceCents: 500 }),
      account({ balanceCents: 99999, archivedAt: '2026-10-01T00:00:00Z' }),
    ])
    expect(total).toBe(1500)
  })
})

describe('availableBalance: the "Dinero disponible" of Inicio', () => {
  it('adds cash, banks and wallets only: no cards, no archived accounts, nothing of savings goals', () => {
    const accounts = [
      account({ id: 'cash', kind: 'cash', balanceCents: 12_000_00 }),
      account({ id: 'galicia', kind: 'bank', balanceCents: 216_000_00 }),
      account({ id: 'santander', kind: 'bank', balanceCents: 300_000_00 }),
      account({ id: 'mp', kind: 'wallet', balanceCents: 40_000_00 }),
      // Debt of a card, a card with credit in favor and a limit: none of them is money in hand.
      account({
        id: 'visa',
        kind: 'credit_card',
        balanceCents: -418_333_33,
        creditLimitCents: 900_000_00,
      }),
      account({
        id: 'favor',
        kind: 'credit_card',
        balanceCents: 5_000_00,
        creditLimitCents: 100_000_00,
      }),
      account({
        id: 'old',
        kind: 'bank',
        balanceCents: 99_999_00,
        archivedAt: '2026-10-01T00:00:00Z',
      }),
    ]
    expect(availableBalance(accounts)).toBe(568_000_00)
  })

  it('counts a transfer between own accounts once (the total does not change)', () => {
    const before = [
      account({ balanceCents: 100_000_00 }),
      account({ id: 'b', balanceCents: 50_000_00 }),
    ]
    const after = [
      account({ balanceCents: 70_000_00 }),
      account({ id: 'b', balanceCents: 80_000_00 }),
    ]
    expect(availableBalance(after)).toBe(availableBalance(before))
  })
})

describe('credit cards', () => {
  it('keeps card debt out of the available balance and reports it separately', () => {
    const accounts = [
      account({ balanceCents: 30_000_00 }),
      account({ id: 'card', kind: 'credit_card', balanceCents: -12_000_00 }),
      account({
        id: 'old',
        kind: 'credit_card',
        balanceCents: -5_000_00,
        archivedAt: '2026-10-01T00:00:00Z',
      }),
    ]
    expect(availableBalance(accounts)).toBe(30_000_00)
    expect(cardDebt(accounts)).toBe(12_000_00)
  })

  it('a card paid beyond its debt owes nothing', () => {
    expect(cardDebt([account({ kind: 'credit_card', balanceCents: 2_000_00 })])).toBe(0)
  })

  it('accepts the card kind in the account form', () => {
    expect(
      accountFormSchema.parse({ name: 'Visa', kind: 'credit_card', openingBalance: '50.000' }),
    ).toEqual({
      name: 'Visa',
      kind: 'credit_card',
      openingBalance: 50_000_00,
      creditLimit: null,
      closingDay: null,
      dueDay: null,
    })
  })
})

describe('adjustment amounts', () => {
  it('an account is adjusted to what is typed; a card to minus the typed debt', () => {
    expect(adjustmentTarget({ kind: 'cash' }, 20_000_00)).toBe(20_000_00)
    expect(adjustmentTarget({ kind: 'credit_card' }, 50_000_00)).toBe(-50_000_00)
    expect(adjustmentTarget({ kind: 'credit_card' }, -1_000_00)).toBe(1_000_00)
  })

  it('parses signed es-AR amounts', () => {
    expect(parseSignedAmount('1.500,50')).toBe(150_050)
    expect(parseSignedAmount('-250')).toBe(-25_000)
    expect(parseSignedAmount(' $ 2.000 ')).toBe(200_000)
    expect(parseSignedAmount('abc')).toBeNull()
    expect(parseSignedAmount('')).toBeNull()
    expect(parseSignedAmount('--5')).toBeNull()
  })
})

describe('card settings in the account form', () => {
  const card = { name: 'Visa', kind: 'credit_card', openingBalance: '' }

  it('parses limit, closing and due day', () => {
    const parsed = accountFormSchema.parse({
      ...card,
      creditLimit: '500.000',
      closingDay: '25',
      dueDay: '5',
    })
    expect(parsed).toMatchObject({ creditLimit: 500_000_00, closingDay: 25, dueDay: 5 })
  })

  it('all three are optional, but closing and due come together', () => {
    expect(accountFormSchema.safeParse(card).success).toBe(true)
    expect(accountFormSchema.safeParse({ ...card, closingDay: '25' }).success).toBe(false)
    expect(accountFormSchema.safeParse({ ...card, dueDay: '5' }).success).toBe(false)
  })

  it('rejects days outside 1-31 and a zero limit', () => {
    expect(accountFormSchema.safeParse({ ...card, closingDay: '0', dueDay: '5' }).success).toBe(
      false,
    )
    expect(accountFormSchema.safeParse({ ...card, closingDay: '32', dueDay: '5' }).success).toBe(
      false,
    )
    expect(accountFormSchema.safeParse({ ...card, closingDay: '2,5', dueDay: '5' }).success).toBe(
      false,
    )
    expect(accountFormSchema.safeParse({ ...card, creditLimit: '0' }).success).toBe(false)
  })

  it('drops card settings when the account is not a card', () => {
    const parsed = accountFormSchema.parse({
      name: 'Caja',
      kind: 'cash',
      creditLimit: '1000',
      closingDay: '5',
      dueDay: '10',
    })
    expect(parsed).toMatchObject({ creditLimit: null, closingDay: null, dueDay: null })
  })
})

describe('available credit', () => {
  it('is the limit minus all the debt, installments included', () => {
    expect(availableCredit({ creditLimitCents: 500_000_00, balanceCents: -110_000_00 })).toBe(
      390_000_00,
    )
  })
  it('is null without a limit, may go negative, and ignores credit in favor', () => {
    expect(availableCredit({ creditLimitCents: null, balanceCents: -1_00 })).toBeNull()
    expect(availableCredit({ creditLimitCents: 10_000_00, balanceCents: -15_000_00 })).toBe(
      -5_000_00,
    )
    expect(availableCredit({ creditLimitCents: 10_000_00, balanceCents: 3_000_00 })).toBe(10_000_00)
  })
})

describe('transfer data', () => {
  it('only banks and wallets can hold it', () => {
    expect(canHoldTransferData({ kind: 'bank' })).toBe(true)
    expect(canHoldTransferData({ kind: 'wallet' })).toBe(true)
    expect(canHoldTransferData({ kind: 'cash' })).toBe(false)
    expect(canHoldTransferData({ kind: 'credit_card' })).toBe(false)
  })

  it('both fields are optional and empty means none', () => {
    expect(transferDataSchema.parse({ alias: '', cbu: '' })).toEqual({ alias: null, cbu: null })
    expect(transferDataSchema.parse({})).toEqual({ alias: null, cbu: null })
    expect(transferDataSchema.parse({ alias: '  mi.alias-1 ' })).toEqual({
      alias: 'mi.alias-1',
      cbu: null,
    })
  })

  it('takes the CBU pasted with spaces or dashes', () => {
    expect(transferDataSchema.parse({ cbu: '0070 0000 3000-0012 3456 78' }).cbu).toBe(
      '0070000030000012345678',
    )
  })

  it.each([['corto'], ['con espacio uno'], ['ñandú.alias'], ['a'.repeat(21)]])(
    'rejects the alias %j',
    (alias) => {
      expect(transferDataSchema.safeParse({ alias }).success).toBe(false)
    },
  )

  it.each([
    ['123'],
    ['007000003000001234567'],
    ['00700000300000123456789'],
    ['abcdefghijklmnopqrstuv'],
  ])('rejects the CBU %j', (cbu) => {
    expect(transferDataSchema.safeParse({ cbu }).success).toBe(false)
  })

  it('lists what can be shared: alias and CBU for a bank, alias and CVU for a wallet', () => {
    expect(
      transferLines({
        kind: 'bank',
        transferAlias: 'galicia.sueldo',
        transferCbu: '0070000030000012345678',
      }),
    ).toEqual(['Alias: galicia.sueldo', 'CBU: 0070000030000012345678'])
    expect(
      transferLines({ kind: 'wallet', transferAlias: null, transferCbu: '0000003100012345678901' }),
    ).toEqual(['CVU: 0000003100012345678901'])
    expect(transferLines({ kind: 'bank', transferAlias: null, transferCbu: null })).toEqual([])
    expect(hasTransferData({ transferAlias: null, transferCbu: null })).toBe(false)
    expect(hasTransferData({ transferAlias: 'x'.repeat(6), transferCbu: null })).toBe(true)
  })
})
