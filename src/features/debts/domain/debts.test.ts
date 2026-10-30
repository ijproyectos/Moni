import type { MemberBalance } from '@/features/groups/domain/group'
import { makeAccount } from '@/features/accounts/domain/testing'
import {
  buildDebtMessage,
  buildPendingDebts,
  noticeText,
  reportStatusLabel,
  sharedTransferFor,
  toReceiveAccount,
  type Notice,
  type PaymentReport,
} from './debts'

const member = (userId: string, displayName: string | null, netCents: number): MemberBalance => ({
  userId,
  displayName,
  paidCents: 0,
  owedCents: 0,
  settledOutCents: 0,
  settledInCents: 0,
  netCents,
})

const casa = {
  groupId: 'g1',
  groupName: 'Casa',
  // Ana is owed 60.000 by Beto (30.000) and Carla (30.000).
  balances: [
    member('ana', 'Ana Pérez', 60_000_00),
    member('beto', 'Beto', -30_000_00),
    member('carla', 'Carla', -30_000_00),
  ],
}

describe('buildPendingDebts', () => {
  it('lists, for the person, who owes them and whom they owe, with real names and the exact amount', () => {
    const asAna = buildPendingDebts([casa], 'ana', [])
    expect(asAna.map((d) => [d.otherName, d.direction, d.amountCents, d.groupName])).toEqual([
      ['Beto', 'owed', 30_000_00, 'Casa'],
      ['Carla', 'owed', 30_000_00, 'Casa'],
    ])
    const asBeto = buildPendingDebts([casa], 'beto', [])
    expect(asBeto).toHaveLength(1)
    expect(asBeto[0]).toMatchObject({
      otherName: 'Ana Pérez',
      direction: 'owe',
      amountCents: 30_000_00,
    })
  })

  it('shows only the debts the person is part of (not what two others owe each other)', () => {
    const group = {
      groupId: 'g2',
      groupName: 'Viaje',
      balances: [member('x', 'X', 10_000_00), member('y', 'Y', -10_000_00), member('me', 'Yo', 0)],
    }
    expect(buildPendingDebts([group], 'me', [])).toEqual([])
  })

  it('uses the same simplification as the group (the debts of a chain collapse), group by group', () => {
    const chain = {
      groupId: 'g3',
      groupName: 'Amigos',
      balances: [member('a', 'A', 100_00), member('b', 'B', 0), member('c', 'C', -100_00)],
    }
    const forC = buildPendingDebts([chain], 'c', [])
    expect(forC).toHaveLength(1)
    expect(forC[0]).toMatchObject({ otherName: 'A', amountCents: 100_00 })
    const both = buildPendingDebts([casa, chain], 'beto', [])
    expect(both.map((d) => d.groupName)).toEqual(['Casa'])
  })

  it('a member without a name is "Sin nombre", never an invented one', () => {
    const group = {
      groupId: 'g',
      groupName: 'G',
      balances: [member('a', null, 5_00), member('me', 'Yo', -5_00)],
    }
    expect(buildPendingDebts([group], 'me', [])[0]?.otherName).toBe('Sin nombre')
  })

  it('marks a debt with an open report and ignores closed ones', () => {
    const report = (status: PaymentReport['status']): PaymentReport => ({
      id: `r-${status}`,
      groupId: 'g1',
      fromUserId: 'beto',
      toUserId: 'ana',
      amountCents: 30_000_00,
      status,
      reportedAt: '2026-10-30T10:00:00Z',
      resolvedAt: status === 'reported' ? null : '2026-10-30T11:00:00Z',
    })
    const open = buildPendingDebts([casa], 'ana', [report('reported'), report('confirmed')])
    expect(open.find((d) => d.otherName === 'Beto')?.report?.id).toBe('r-reported')
    expect(open.find((d) => d.otherName === 'Carla')?.report).toBeNull()
    const closed = buildPendingDebts([casa], 'ana', [report('rejected'), report('cancelled')])
    expect(closed.every((d) => d.report === null)).toBe(true)
  })
})

describe('buildDebtMessage', () => {
  const base = { debtorName: 'Joni Ríos', groupName: 'IJ', amountCents: 10_000_00 }

  it('is a natural first-person message: who, the group and how much', () => {
    expect(buildDebtMessage({ ...base, account: null })).toBe(
      [
        '¡Hola, Joni! Te paso lo que quedó pendiente del grupo IJ.',
        '',
        'Me debés $10.000.',
        '',
        'Enviado desde Moni',
      ].join('\n'),
    )
  })

  it('without a chosen account it carries no transfer data at all', () => {
    expect(buildDebtMessage({ ...base, account: null })).not.toMatch(
      /Alias|CBU|CVU|transferirme|Banco/,
    )
  })

  it('with the chosen account it adds its bank and its alias / CBU, as in the example', () => {
    const galicia = toReceiveAccount(
      makeAccount({
        name: 'Galicia',
        kind: 'bank',
        transferAlias: 'ana.galicia',
        transferCbu: null,
      }),
    )
    expect(buildDebtMessage({ ...base, account: galicia })).toBe(
      [
        '¡Hola, Joni! Te paso lo que quedó pendiente del grupo IJ.',
        '',
        'Me debés $10.000.',
        '',
        'Podés transferirme a:',
        'Banco: Galicia',
        'Alias: ana.galicia',
        '',
        'Enviado desde Moni',
      ].join('\n'),
    )
    const both = toReceiveAccount(
      makeAccount({
        name: 'Galicia',
        kind: 'bank',
        transferAlias: 'ana.galicia',
        transferCbu: '0070000030000012345678',
      }),
    )
    expect(buildDebtMessage({ ...base, account: both })).toContain('CBU: 0070000030000012345678')
  })

  it('a wallet is introduced as a wallet and its number is a CVU', () => {
    const wallet = toReceiveAccount(
      makeAccount({ name: 'Mercado Pago', kind: 'wallet', transferCbu: '0000003100012345678901' }),
    )
    const text = buildDebtMessage({ ...base, account: wallet })
    expect(text).toContain('Billetera: Mercado Pago')
    expect(text).toContain('CVU: 0000003100012345678901')
  })

  it('an account with no data adds nothing', () => {
    const empty = toReceiveAccount(makeAccount({ name: 'Brubank', kind: 'bank' }))
    expect(buildDebtMessage({ ...base, account: empty })).not.toContain('Brubank')
  })
})

describe('sharedTransferFor', () => {
  const reminder = (over: Partial<Notice>): Notice => ({
    id: 'n',
    kind: 'debt_reminder',
    groupId: 'g1',
    groupName: 'Casa',
    actorId: 'ana',
    actorName: 'Ana',
    amountCents: 100,
    reportId: null,
    transferLabel: 'Galicia',
    transferAlias: 'ana.galicia',
    transferCbu: null,
    createdAt: '2026-10-30T10:00:00Z',
    readAt: null,
    ...over,
  })
  const debt = { groupId: 'g1', otherUserId: 'ana' }

  it('gives what the creditor shared, from their latest reminder for that group', () => {
    const notices = [
      reminder({ id: 'old', transferAlias: 'viejo.alias', createdAt: '2026-10-01T10:00:00Z' }),
      reminder({ id: 'new', transferAlias: 'nuevo.alias', createdAt: '2026-10-30T10:00:00Z' }),
    ]
    expect(sharedTransferFor(debt, notices)).toEqual({
      label: 'Galicia',
      alias: 'nuevo.alias',
      cbu: null,
    })
  })

  it('is null when nothing was shared, or when it came from another group or person', () => {
    expect(sharedTransferFor(debt, [])).toBeNull()
    expect(
      sharedTransferFor(debt, [reminder({ transferAlias: null, transferCbu: null })]),
    ).toBeNull()
    expect(sharedTransferFor(debt, [reminder({ groupId: 'g2' })])).toBeNull()
    expect(sharedTransferFor(debt, [reminder({ actorId: 'beto' })])).toBeNull()
    expect(sharedTransferFor(debt, [reminder({ kind: 'payment_confirmed' })])).toBeNull()
  })
})

describe('notices and statuses', () => {
  const notice = (kind: Notice['kind']): Notice => ({
    id: 'n',
    kind,
    groupId: 'g1',
    groupName: 'Casa',
    actorId: 'ana',
    actorName: 'Ana',
    amountCents: 30_000_00,
    reportId: null,
    transferLabel: null,
    transferAlias: null,
    transferCbu: null,
    createdAt: '2026-10-30T10:00:00Z',
    readAt: null,
  })

  it('says who asks, how much and from which group', () => {
    expect(noticeText(notice('debt_reminder'))).toBe(
      'Ana te recuerda que le debés $30.000 del grupo Casa.',
    )
    expect(noticeText(notice('payment_reported'))).toContain(
      'Ana informó que te pagó $30.000 del grupo Casa',
    )
    expect(noticeText(notice('payment_confirmed'))).toContain(
      'Ana confirmó que recibió tu pago de $30.000',
    )
    expect(noticeText(notice('payment_rejected'))).toContain('todavía no recibió tu pago')
  })

  it('labels the states of a payment', () => {
    expect(reportStatusLabel('reported')).toBe('Pago informado')
    expect(reportStatusLabel('confirmed')).toBe('Saldada')
  })
})
