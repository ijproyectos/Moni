import { z } from 'zod'
import { parseAmountInput } from '@/shared/lib/amountInput'
import type { GroupKind, GroupRole, RowStatus, SplitMethod } from '@/shared/lib/database.types'
import type { Cents } from '@/shared/lib/money'
import { isIsoDate, type IsoDate } from '@/shared/lib/month'

export const GROUP_KINDS: readonly GroupKind[] = ['casa', 'viaje', 'pareja', 'amigos']

export const GROUP_KIND_LABELS: Record<GroupKind, string> = {
  casa: 'Casa',
  viaje: 'Viaje',
  pareja: 'Pareja',
  amigos: 'Amigos',
}

export interface MyGroup {
  id: string
  name: string
  kind: GroupKind
  role: GroupRole
  memberCount: number
  /** Positive: the group owes me. Negative: I owe the group. */
  myNetCents: Cents
  lastActivity: string
}

export interface Group {
  id: string
  name: string
  kind: GroupKind
  createdBy: string
  archivedAt: string | null
  createdAt: string
}

export interface GroupMember {
  userId: string
  displayName: string | null
  avatarUrl: string | null
  role: GroupRole
  joinedAt: string
  /** Set when the member left; they stay listed so old expenses keep their names. */
  leftAt: string | null
}

export interface MemberBalance {
  userId: string
  displayName: string | null
  paidCents: Cents
  owedCents: Cents
  settledOutCents: Cents
  settledInCents: Cents
  /** paid - owed + settledOut - settledIn. */
  netCents: Cents
}

export interface GroupInvite {
  id: string
  groupId: string
  code: string
  createdBy: string
  expiresAt: string
  maxUses: number
  uses: number
  revokedAt: string | null
}

/** An invite someone can still use: not revoked, not expired and with uses left. */
export function isInviteActive(invite: GroupInvite, now: Date = new Date()): boolean {
  return (
    invite.revokedAt === null &&
    invite.uses < invite.maxUses &&
    new Date(invite.expiresAt).getTime() > now.getTime()
  )
}

export interface ExpenseSplit {
  userId: string
  shareCents: Cents
  percent: number | null
}

export interface SharedExpense {
  id: string
  groupId: string
  paidBy: string
  amountCents: Cents
  description: string
  templateSlug: string | null
  occurredOn: IsoDate
  splitMethod: SplitMethod
  status: RowStatus
  createdBy: string
  createdAt: string
  splits: ExpenseSplit[]
}

export interface Settlement {
  id: string
  groupId: string
  fromUser: string
  toUser: string
  amountCents: Cents
  occurredOn: IsoDate
  note: string | null
  status: RowStatus
  createdBy: string
  createdAt: string
}

/** Display name with a fallback for members who never set one. */
export function memberLabel(member: { displayName: string | null }): string {
  return member.displayName?.trim() || 'Sin nombre'
}

export const groupFormSchema = z.object({
  name: z.string().trim().min(1, 'Ponele un nombre al grupo.').max(60, 'Máximo 60 caracteres.'),
  kind: z.enum(['casa', 'viaje', 'pareja', 'amigos'], { message: 'Elegí un tipo de grupo.' }),
})

export type GroupFormInput = z.input<typeof groupFormSchema>
export type GroupFormValues = z.output<typeof groupFormSchema>

/**
 * Invite codes are 8 chars (new ones) or 12 (issued before the change), without I, O, 0 or 1.
 * Users may type them in any case, with spaces or dashes.
 */
export const INVITE_CODE_PATTERN = /^(?:[A-HJ-NP-Z2-9]{8}|[A-HJ-NP-Z2-9]{12})$/

export const INVITE_CODE_MAX_LENGTH = 12

/** Whitespace and every kind of dash: "abcd-2345", "ABCD 2345" and "ABCD–2345" are the same code. */
const CODE_SEPARATORS = /[\s\-\u2010-\u2015\u2212]+/g

export function normalizeInviteCode(input: string): string {
  return input.replace(CODE_SEPARATORS, '').toUpperCase()
}

/** Strips spaces and dashes while typing: "abcd-2345" -> "ABCD2345" (max 12 characters). */
export function cleanCodeInput(raw: string): string {
  return normalizeInviteCode(raw).slice(0, INVITE_CODE_MAX_LENGTH)
}

/**
 * Finds the invite code in pasted text: a bare code, a "/unirse/CODE" or "/g/CODE" link, or a
 * message that contains one. Falls back to the cleaned text so the person can still fix it.
 */
export function extractInviteCode(text: string): string {
  const candidates = text.match(/[A-Za-z0-9]{4}(?:[-\s]?[A-Za-z0-9]{4}){1,2}/g) ?? []
  for (const candidate of [...candidates].reverse()) {
    const code = normalizeInviteCode(candidate)
    if (INVITE_CODE_PATTERN.test(code)) return code
  }
  const lastSegment = text.trim().split('/').pop() ?? text
  return cleanCodeInput(lastSegment.split(/[?#]/)[0] ?? lastSegment)
}

export const joinGroupSchema = z.object({
  code: z
    .string()
    .transform(normalizeInviteCode)
    .refine((code) => INVITE_CODE_PATTERN.test(code), 'El código tiene 8 letras o números.'),
})

/** "33,34" or "33.34" -> 33.34. Null when not a percentage with up to 2 decimals. */
export function parsePercentInput(input: string): number | null {
  const text = input.replace(/[\s%]/g, '').replace(',', '.')
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) return null
  const value = Number(text)
  return value > 0 && value <= 100 ? value : null
}

const amountField = z.string().transform((value, ctx) => {
  const cents = parseAmountInput(value)
  if (cents === null || cents <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Ingresá un monto mayor a cero.' })
    return z.NEVER
  }
  return cents
})

export const sharedExpenseFormSchema = z
  .object({
    amount: amountField,
    description: z
      .string()
      .trim()
      .min(1, 'Contá en qué se gastó.')
      .max(120, 'Máximo 120 caracteres.'),
    templateSlug: z
      .string()
      .nullish()
      .transform((value) => value || null),
    occurredOn: z.string().refine(isIsoDate, 'Elegí una fecha válida.'),
    paidBy: z.string().uuid('Elegí quién pagó.'),
    splitMethod: z.enum(['equal', 'percent']),
    participants: z.array(z.string().uuid()).min(1, 'Elegí al menos una persona.').max(50),
    /** Percent typed per participant id; only read for the percent method. */
    percents: z.record(z.string(), z.string()).default({}),
    payerAccountId: z
      .string()
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.participants).size !== value.participants.length) {
      ctx.addIssue({ code: 'custom', path: ['participants'], message: 'Hay personas repetidas.' })
    }
    if (value.splitMethod !== 'percent') return
    const parsed = value.participants.map((id) => parsePercentInput(value.percents[id] ?? ''))
    if (parsed.some((p) => p === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['percents'],
        message: 'Completá un porcentaje válido para cada persona.',
      })
      return
    }
    const sumBp = parsed.reduce<number>((sum, p) => sum + Math.round((p ?? 0) * 100), 0)
    if (sumBp !== 10000) {
      ctx.addIssue({
        code: 'custom',
        path: ['percents'],
        message: 'Los porcentajes tienen que sumar 100.',
      })
    }
  })
  .transform((value) => ({
    ...value,
    /** Percentages aligned with `participants`; null for equal splits. */
    percentValues:
      value.splitMethod === 'percent'
        ? value.participants.map((id) => parsePercentInput(value.percents[id] ?? '') ?? 0)
        : null,
  }))

export type SharedExpenseFormInput = z.input<typeof sharedExpenseFormSchema>
/** Parsed form: `amount` is integer cents. */
export type SharedExpenseFormValues = z.output<typeof sharedExpenseFormSchema>

export const settlementFormSchema = z.object({
  toUser: z.string().uuid('Elegí a quién le pagás.'),
  amount: amountField,
  occurredOn: z.string().refine(isIsoDate, 'Elegí una fecha válida.'),
  note: z
    .string()
    .trim()
    .max(200, 'La nota puede tener hasta 200 caracteres.')
    .optional()
    .transform((value) => (value ? value : null)),
  accountId: z
    .string()
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
})

export type SettlementFormInput = z.input<typeof settlementFormSchema>
export type SettlementFormValues = z.output<typeof settlementFormSchema>

/** Signed net as a short sentence part for the UI layer to localise: who owes whom. */
export function netDirection(netCents: Cents): 'owed' | 'owes' | 'even' {
  return netCents > 0 ? 'owed' : netCents < 0 ? 'owes' : 'even'
}
