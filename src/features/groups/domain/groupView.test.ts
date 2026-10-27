import { describe, expect, it } from 'vitest'
import type { MemberBalance, SharedExpense } from './group'
import {
  canRecordReceipt,
  canVoidExpense,
  canVoidSettlement,
  describeGroupNet,
  describeMyBalance,
  groupSubtitle,
  leaveState,
  suggestTransfers,
} from './groupView'

const balance = (userId: string, netCents: number): MemberBalance => ({
  userId,
  displayName: userId,
  paidCents: 0,
  owedCents: 0,
  settledOutCents: 0,
  settledInCents: 0,
  netCents,
})

describe('describeGroupNet', () => {
  it('labels owed, owing, settled and empty groups', () => {
    expect(describeGroupNet({ myNetCents: 5000, memberCount: 3 })).toEqual({
      tone: 'owed',
      label: 'Te deben',
      amountCents: 5000,
    })
    expect(describeGroupNet({ myNetCents: -2500, memberCount: 3 })).toMatchObject({
      tone: 'owes',
      label: 'Debés',
      amountCents: 2500,
    })
    expect(describeGroupNet({ myNetCents: 0, memberCount: 3 }).label).toBe('Estás al día')
    expect(describeGroupNet({ myNetCents: 0, memberCount: 1 }).label).toBe('Sin gastos todavía')
  })
})

describe('describeMyBalance and groupSubtitle', () => {
  it('describes my balance', () => {
    expect(describeMyBalance(0).label).toBe('Estás al día')
    expect(describeMyBalance(-100).amountCents).toBe(100)
  })
  it('builds the card subtitle', () => {
    expect(groupSubtitle('Casa', 1)).toBe('Casa · Solo vos por ahora')
    expect(groupSubtitle('Viaje', 3)).toBe('Viaje · 3 miembros')
  })
})

describe('leaveState', () => {
  it('only allows leaving with a zero balance and explains why otherwise', () => {
    expect(leaveState(0)).toEqual({ canLeave: true, reason: null })
    expect(leaveState(100).canLeave).toBe(false)
    expect(leaveState(-100).reason).toMatch(/debés/i)
    expect(leaveState(null).canLeave).toBe(false)
  })
})

describe('suggestTransfers', () => {
  it('settles the group with simplifyDebts', () => {
    const transfers = suggestTransfers([
      balance('a', 6666),
      balance('b', -3333),
      balance('c', -3333),
    ])
    expect(transfers).toEqual([
      { fromUserId: 'b', toUserId: 'a', amountCents: 3333 },
      { fromUserId: 'c', toUserId: 'a', amountCents: 3333 },
    ])
  })
  it('returns nothing instead of throwing when balances do not add up', () => {
    expect(suggestTransfers([balance('a', 100)])).toEqual([])
  })
})

describe('permissions', () => {
  it('lets the creator, payer or a participant void a posted expense', () => {
    const expense: Pick<SharedExpense, 'status' | 'createdBy' | 'paidBy' | 'splits'> = {
      status: 'posted',
      createdBy: 'a',
      paidBy: 'b',
      splits: [{ userId: 'c', shareCents: 100, percent: null }],
    }
    expect(canVoidExpense(expense, 'a')).toBe(true)
    expect(canVoidExpense(expense, 'b')).toBe(true)
    expect(canVoidExpense(expense, 'c')).toBe(true)
    expect(canVoidExpense(expense, 'd')).toBe(false)
    expect(canVoidExpense(expense, undefined)).toBe(false)
    expect(canVoidExpense({ ...expense, status: 'voided' }, 'a')).toBe(false)
  })
  it('handles settlements', () => {
    const s = { status: 'posted', createdBy: 'a', fromUser: 'a', toUser: 'b' } as const
    expect(canVoidSettlement(s, 'a')).toBe(true)
    expect(canVoidSettlement(s, 'b')).toBe(true)
    expect(canVoidSettlement(s, 'c')).toBe(false)
    expect(canRecordReceipt(s, 'b')).toBe(true)
    expect(canRecordReceipt(s, 'a')).toBe(false)
  })
})
