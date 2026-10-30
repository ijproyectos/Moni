import {
  activeTotals,
  alertText,
  barValue,
  checkSavingsCommitted,
  describeSchedule,
  exceededCents,
  goalReminders,
  missingCents,
  nextMonthDay,
  nextReminderLabel,
  nextWeekday,
  parseSavingsOverview,
  percentText,
  ratioOf,
  reminderText,
  savingsAlerts,
  savingsKind,
  SAVINGS_KINDS,
} from './savings'
import { makeGoal, makeMovement, makeSavings, makeSavingsAccount } from './testing'

describe('goal kinds', () => {
  it('offers the requested kinds, each with an icon, and a generic fallback', () => {
    expect(SAVINGS_KINDS.map((k) => k.label)).toEqual([
      'Viaje',
      'Auto',
      'Casa',
      'Computadora',
      'Emergencia',
      'Estudios',
      'Otra',
    ])
    expect(SAVINGS_KINDS.every((k) => k.icon)).toBe(true)
    expect(savingsKind('casa').label).toBe('Casa')
    expect(savingsKind('algo-nuevo').id).toBe('otra')
  })
})

describe('progress', () => {
  it('reserved over target, with what is missing', () => {
    const g = makeGoal({ reservedCents: 150_000_00, targetCents: 600_000_00 })
    expect(ratioOf(g)).toBe(0.25)
    expect(percentText(g)).toBe('25%')
    expect(barValue(g)).toBe(0.25)
    expect(missingCents(g)).toBe(450_000_00)
    expect(exceededCents(g)).toBe(0)
  })

  it('beyond 100 % the bar stays full and the real percentage and the excess are shown', () => {
    const g = makeGoal({ reservedCents: 780_000_00, targetCents: 600_000_00 })
    expect(percentText(g)).toBe('130%')
    expect(barValue(g)).toBe(1)
    expect(missingCents(g)).toBe(0)
    expect(exceededCents(g)).toBe(180_000_00)
  })

  it('an empty goal is 0 % and never negative', () => {
    expect(percentText(makeGoal({ reservedCents: 0 }))).toBe('0%')
    expect(barValue(makeGoal({ reservedCents: -5 }))).toBe(0)
    expect(percentText(makeGoal({ targetCents: 0 }))).toBe('0%')
  })

  it('totals count only the active goals', () => {
    const goals = [
      makeGoal({ id: 'a', reservedCents: 10_000_00, targetCents: 100_000_00 }),
      makeGoal({ id: 'b', reservedCents: 20_000_00, targetCents: 50_000_00 }),
      makeGoal({ id: 'c', status: 'paused', reservedCents: 99_000_00, targetCents: 99_000_00 }),
      makeGoal({ id: 'd', status: 'archived', reservedCents: 0, targetCents: 99_000_00 }),
    ]
    expect(activeTotals(goals)).toEqual({
      reservedCents: 30_000_00,
      targetCents: 150_000_00,
      count: 2,
    })
  })
})

describe('alerts: one per compromised account, derived from the real balance', () => {
  const galicia = makeSavingsAccount({
    balanceCents: 20_000_00,
    reservedCents: 30_000_00,
    freeCents: -10_000_00,
  })
  const goals = [
    makeGoal({ id: 'a', name: 'Viaje', reservedCents: 20_000_00 }),
    makeGoal({ id: 'b', name: 'Auto', reservedCents: 10_000_00 }),
    makeGoal({ id: 'c', name: 'Vieja', reservedCents: 0 }),
    makeGoal({ id: 'd', name: 'Otra cuenta', accountId: 'santander', reservedCents: 5_000_00 }),
  ]

  it('alerts when the balance is under what the goals reserve, listing the goals involved, once per account', () => {
    const alerts = savingsAlerts({
      accounts: [
        galicia,
        makeSavingsAccount({
          id: 'santander',
          name: 'Santander',
          balanceCents: 50_000_00,
          reservedCents: 5_000_00,
          freeCents: 45_000_00,
        }),
      ],
      goals,
    })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      accountName: 'Galicia',
      reservedCents: 30_000_00,
      balanceCents: 20_000_00,
      shortfallCents: 10_000_00,
    })
    expect(alerts[0]?.goals.map((g) => g.name)).toEqual(['Viaje', 'Auto'])
  })

  it('uses the exact wording of the product', () => {
    const [alert] = savingsAlerts({ accounts: [galicia], goals })
    expect(alert && alertText(alert)).toBe(
      '¡Ojo con tus ahorros! Tenés $30.000 reservados para tus metas en Galicia, pero tu saldo actual es de $20.000. Te faltan $10.000 para cubrirlos.',
    )
  })

  it('no alert when the money covers the reserve exactly, or when nothing is reserved', () => {
    expect(
      savingsAlerts({
        accounts: [
          makeSavingsAccount({ balanceCents: 30_000_00, reservedCents: 30_000_00, freeCents: 0 }),
        ],
        goals,
      }),
    ).toEqual([])
    expect(
      savingsAlerts({
        accounts: [
          makeSavingsAccount({ balanceCents: -5_000_00, reservedCents: 0, freeCents: -5_000_00 }),
        ],
        goals,
      }),
    ).toEqual([])
  })

  it('a negative balance is an alert too, and the shortfall counts the whole reserve plus the overdraft', () => {
    const [alert] = savingsAlerts({
      accounts: [
        makeSavingsAccount({
          balanceCents: -5_000_00,
          reservedCents: 30_000_00,
          freeCents: -35_000_00,
        }),
      ],
      goals,
    })
    expect(alert?.shortfallCents).toBe(35_000_00)
  })

  it('the alert is stable: the same data gives the same alert every time (nothing new per load)', () => {
    const input = { accounts: [galicia], goals }
    expect(savingsAlerts(input)).toEqual(savingsAlerts(input))
  })
})

describe('checkSavingsCommitted (before confirming a movement)', () => {
  const base = { accountName: 'Galicia', balanceCents: 150_000_00, reservedCents: 30_000_00 }
  it('warns when the movement leaves the account under its reserve, with the numbers', () => {
    expect(checkSavingsCommitted({ ...base, amountCents: 130_000_00 })).toEqual({
      accountName: 'Galicia',
      reservedCents: 30_000_00,
      balanceCents: 150_000_00,
      amountCents: 130_000_00,
      resultingCents: 20_000_00,
      shortfallCents: 10_000_00,
    })
  })
  it('does not warn while the reserve stays covered (exactly covered is fine) or when nothing is reserved', () => {
    expect(checkSavingsCommitted({ ...base, amountCents: 120_000_00 })).toBeNull()
    expect(checkSavingsCommitted({ ...base, reservedCents: 0, amountCents: 149_000_00 })).toBeNull()
  })
  it('counts back the amount of the movement being edited', () => {
    expect(
      checkSavingsCommitted({ ...base, amountCents: 130_000_00, releasedCents: 10_000_00 }),
    ).toBeNull()
  })
  it('an overdraft is warned about too, with the negative result', () => {
    const w = checkSavingsCommitted({ ...base, balanceCents: 10_000_00, amountCents: 25_000_00 })
    expect(w?.resultingCents).toBe(-15_000_00)
    expect(w?.shortfallCents).toBe(45_000_00)
  })
})

describe('reminders', () => {
  const due = { status: 'active' as const, remind: true, frequency: 'monthly' as const }
  it('one per goal that is due today, with the suggested amount when there is one', () => {
    const out = goalReminders(
      makeSavings({
        goals: [
          makeGoal({
            ...due,
            name: 'tu viaje',
            suggestedCents: 30_000_00,
            reminderOn: '2026-11-10',
          }),
        ],
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.text).toBe(
      'Hoy te propusiste ahorrar $30.000 para tu viaje. ¿Querés agregar un aporte?',
    )
    expect(out[0]?.overdue).toBe(false)
  })

  it('works without a suggested amount', () => {
    const [r] = goalReminders(
      makeSavings({ goals: [makeGoal({ ...due, name: 'Auto', reminderOn: '2026-11-10' })] }),
    )
    expect(r?.text).toBe('Hoy es tu momento de ahorrar para Auto. ¿Querés agregar un aporte?')
  })

  it('an unanswered reminder stays as ONE item, worded as pending', () => {
    const [r] = goalReminders(
      makeSavings({
        goals: [
          makeGoal({ ...due, name: 'Auto', suggestedCents: 5_000_00, reminderOn: '2026-11-03' }),
        ],
      }),
    )
    expect(r?.overdue).toBe(true)
    expect(r?.text).toMatch(/^Te propusiste ahorrar \$5\.000 para Auto/)
  })

  it('future dates, paused, completed, archived and non-reminding goals produce nothing', () => {
    const goals = [
      makeGoal({ ...due, id: 'a', reminderOn: '2026-11-11' }),
      makeGoal({ ...due, id: 'b', status: 'paused', reminderOn: '2026-11-10' }),
      makeGoal({ ...due, id: 'c', status: 'completed', reminderOn: '2026-11-10' }),
      makeGoal({ ...due, id: 'd', status: 'archived', reminderOn: '2026-11-10' }),
      makeGoal({ ...due, id: 'e', remind: false, reminderOn: '2026-11-10' }),
      makeGoal({ ...due, id: 'f', reminderOn: null }),
    ]
    expect(goalReminders(makeSavings({ goals }))).toEqual([])
  })

  it('text helper', () => {
    expect(reminderText({ name: 'Casa', suggestedCents: null }, false)).toContain('Casa')
  })

  it('label for the card: today or the date, none when it does not remind', () => {
    expect(
      nextReminderLabel({ status: 'active', remind: true, reminderOn: '2026-11-10' }, '2026-11-10'),
    ).toBe('Recordatorio: hoy')
    expect(
      nextReminderLabel({ status: 'active', remind: true, reminderOn: '2026-11-14' }, '2026-11-10'),
    ).toBe('Recordatorio: 14/11')
    expect(
      nextReminderLabel({ status: 'paused', remind: true, reminderOn: '2026-11-14' }, '2026-11-10'),
    ).toBeNull()
    expect(
      nextReminderLabel({ status: 'active', remind: false, reminderOn: null }, '2026-11-10'),
    ).toBeNull()
  })
})

describe('schedules: the weekday or the day of the month', () => {
  it('next weekday counts today', () => {
    // 2026-11-10 is a Tuesday (index 1)
    expect(nextWeekday(1, '2026-11-10')).toBe('2026-11-10')
    expect(nextWeekday(4, '2026-11-10')).toBe('2026-11-13') // Friday
    expect(nextWeekday(0, '2026-11-10')).toBe('2026-11-16') // next Monday
  })
  it('next day of the month, clamped in short months and across the year', () => {
    expect(nextMonthDay(5, '2026-11-10')).toBe('2026-12-05')
    expect(nextMonthDay(10, '2026-11-10')).toBe('2026-11-10')
    expect(nextMonthDay(31, '2026-02-10')).toBe('2026-02-28')
    expect(nextMonthDay(31, '2026-11-10')).toBe('2026-11-30')
    expect(nextMonthDay(5, '2026-12-20')).toBe('2027-01-05')
  })
  it('describes "todos los viernes", "cada 15 días" and "el día 5 de cada mes"', () => {
    expect(describeSchedule('weekly', '2026-11-13')).toBe('Todos los viernes')
    expect(describeSchedule('biweekly', '2026-11-13')).toBe('Cada 15 días, los viernes')
    expect(describeSchedule('monthly', '2026-12-05')).toBe('El día 5 de cada mes')
    expect(describeSchedule('free', null)).toBeNull()
  })
})

describe('parseSavingsOverview', () => {
  it('converts the database JSON (pesos) to cents', () => {
    const parsed = parseSavingsOverview({
      today: '2026-11-10',
      goals: [
        {
          id: 'g1',
          name: 'Viaje',
          icon: 'viaje',
          target_amount: 600000,
          account_id: 'a',
          account_name: 'Galicia',
          account_kind: 'bank',
          account_usable: true,
          target_date: null,
          frequency: 'weekly',
          suggested_amount: null,
          remind: true,
          anchor_on: '2026-11-13',
          next_reminder_on: '2026-11-13',
          reminder_on: '2026-11-13',
          status: 'active',
          reserved: 30000.5,
        },
      ],
      accounts: [
        {
          id: 'a',
          name: 'Galicia',
          kind: 'bank',
          archived: false,
          balance: 150000,
          reserved: 30000.5,
          free: 119999.5,
        },
      ],
      movements: [
        {
          id: 'm',
          goal_id: 'g1',
          kind: 'deposit',
          amount: 30000.5,
          occurred_on: '2026-11-03',
          note: null,
          status: 'posted',
        },
      ],
    })
    expect(parsed.goals[0]).toMatchObject({
      targetCents: 600_000_00,
      reservedCents: 30_000_50,
      suggestedCents: null,
    })
    expect(parsed.accounts[0]).toMatchObject({ balanceCents: 150_000_00, freeCents: 119_999_50 })
    expect(parsed.movements[0]).toEqual(makeMovement({ id: 'm', amountCents: 30_000_50 }))
  })
  it('rejects malformed data', () => {
    expect(() =>
      parseSavingsOverview({ today: 'x', goals: [{}], accounts: [], movements: [] }),
    ).toThrow()
  })
})
