// Simulated "gastos hormiga" analysis (small repeated expenses). No backend yet.
import { createMockStore, useMockStore } from '@/shared/lib/mockStore'
import type { Cents } from '@/shared/lib/money'

export interface AntItem {
  name: string
  icon: 'coffee' | 'kiosk' | 'water'
  count: number
  unitCents: Cents
  totalCents: Cents
  /** Change vs the previous period; 0 = igual. */
  deltaCents: Cents
}

export interface AntPeriod {
  label: string
  rangeLabel: string
  totalCents: Cents
  previousCents: Cents
  previousLabel: string
  currentLabel: string
  tip: string
  items: AntItem[]
}

export const ANTS_WEEK: AntPeriod = {
  label: 'Esta semana',
  rangeLabel: '19 al 25 de oct',
  totalCents: 36_000_00,
  previousCents: 33_800_00,
  previousLabel: 'Semana pasada',
  currentLabel: 'Esta semana',
  tip: 'los cafés pasaron de 4 a 6. Si dos los hacés en casa, ahorrás unos $25.600 al mes. Solo si te cuadra.',
  items: [
    {
      name: 'Café',
      icon: 'coffee',
      count: 6,
      unitCents: 3_200_00,
      totalCents: 19_200_00,
      deltaCents: 6_400_00,
    },
    {
      name: 'Kiosco',
      icon: 'kiosk',
      count: 5,
      unitCents: 2_100_00,
      totalCents: 10_500_00,
      deltaCents: -4_200_00,
    },
    {
      name: 'Agua y gaseosa',
      icon: 'water',
      count: 3,
      unitCents: 2_100_00,
      totalCents: 6_300_00,
      deltaCents: 0,
    },
  ],
}

export const ANTS_MONTH: AntPeriod = {
  label: 'Este mes',
  rangeLabel: 'octubre',
  totalCents: 142_600_00,
  previousCents: 128_900_00,
  previousLabel: 'Mes pasado',
  currentLabel: 'Este mes',
  tip: 'el café es tu hormiga más grande: 22 veces en octubre. Con la mitad, ahorrás unos $35.000 al mes.',
  items: [
    {
      name: 'Café',
      icon: 'coffee',
      count: 22,
      unitCents: 3_200_00,
      totalCents: 70_400_00,
      deltaCents: 12_800_00,
    },
    {
      name: 'Kiosco',
      icon: 'kiosk',
      count: 21,
      unitCents: 2_100_00,
      totalCents: 44_100_00,
      deltaCents: -2_100_00,
    },
    {
      name: 'Agua y gaseosa',
      icon: 'water',
      count: 13,
      unitCents: 2_160_00,
      totalCents: 28_100_00,
      deltaCents: 3_000_00,
    },
  ],
}

export interface WeeklyDigestSettings {
  enabled: boolean
  day: string
  time: string
  smallLimitCents: Cents
}

const settings = createMockStore<WeeklyDigestSettings>({
  enabled: true,
  day: 'Domingo',
  time: '20:00',
  smallLimitCents: 5_000_00,
})

export function useWeeklyDigestSettings(): WeeklyDigestSettings {
  return useMockStore(settings)
}

export function updateWeeklyDigest(patch: Partial<WeeklyDigestSettings>) {
  settings.set((s) => ({ ...s, ...patch }))
}
