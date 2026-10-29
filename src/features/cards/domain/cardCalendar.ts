import { splitEqually, type Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

// Argentine card calendar. These functions mirror the SQL in migration 20261030000000 one to one
// (same rules, same results) so the screen can preview exactly what the database will record.

function parts(date: IsoDate): { year: number; month: number } {
  const [year, month] = date.split('-').map(Number) as [number, number]
  return { year, month }
}

function iso(year: number, month: number, day: number): IsoDate {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toISOString().slice(0, 10)
}

function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The given day of the month of `monthOf`, moved by `monthOffset` months. Days 29-31 fall on the last day of short months. */
export function dayInMonth(monthOf: IsoDate, day: number, monthOffset = 0): IsoDate {
  const { year, month } = parts(monthOf)
  const shifted = new Date(Date.UTC(year, month - 1 + monthOffset, 1))
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth() + 1
  return iso(y, m, Math.min(day, lastDayOf(y, m)))
}

/** Closing date of the statement a purchase made on `on` belongs to. The closing day itself is inclusive. */
export function statementClosingFor(on: IsoDate, closingDay: number): IsoDate {
  const thisMonth = dayInMonth(on, closingDay)
  return on <= thisMonth ? thisMonth : dayInMonth(on, closingDay, 1)
}

/** Due date of a statement: the first due day strictly after its closing date. */
export function dueFor(closing: IsoDate, dueDay: number): IsoDate {
  const sameMonth = dayInMonth(closing, dueDay)
  return sameMonth > closing ? sameMonth : dayInMonth(closing, dueDay, 1)
}

/** The closing date `months` after (or before, if negative) the given closing date. */
export function closingAfter(closing: IsoDate, closingDay: number, months: number): IsoDate {
  return dayInMonth(closing, closingDay, months)
}

/** Statements a bank may file the first installment in, relative to the default: one earlier up to two later. */
export function firstClosingOptions(defaultFirst: IsoDate, closingDay: number): IsoDate[] {
  return [-1, 0, 1, 2].map((offset) => closingAfter(defaultFirst, closingDay, offset))
}

export interface ScheduledInstallment {
  number: number
  amountCents: Cents
  closingOn: IsoDate
  dueOn: IsoDate
}

/**
 * Installments that get recorded for a purchase: from the one the person is on (`current`) up to the
 * last, one per consecutive statement starting at `firstClosing`. The total is split in exact cents over
 * all `count` installments (the first ones carry the leftover cents), so installments already behind
 * the person keep their share and the recorded ones never add up to more than the total.
 */
export function buildInstallmentSchedule(input: {
  totalCents: Cents
  count: number
  current: number
  firstClosing: IsoDate
  closingDay: number
  dueDay: number
}): ScheduledInstallment[] {
  const { totalCents, count, current, firstClosing, closingDay, dueDay } = input
  if (count < 2 || current < 1 || current > count || totalCents <= 0) return []
  const shares = splitEqually(totalCents, count)
  const schedule: ScheduledInstallment[] = []
  for (let number = current; number <= count; number += 1) {
    const closingOn = closingAfter(firstClosing, closingDay, number - current)
    schedule.push({
      number,
      amountCents: shares[number - 1] ?? 0,
      closingOn,
      dueOn: dueFor(closingOn, dueDay),
    })
  }
  return schedule
}
