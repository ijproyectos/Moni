import { daysBetween } from '@/features/fixedExpenses/domain/fixedExpense'
import type { IsoDate } from '@/shared/lib/month'

export type NoticeTone = 'gold' | 'red' | 'green'

export interface NoticeItem {
  key: string
  tone: NoticeTone
  title: string
  detail?: string
  /** Day the notice is about; it decides the group. */
  day: IsoDate
  to: string
}

export interface NoticeGroups {
  today: NoticeItem[]
  thisWeek: NoticeItem[]
}

/** "Hoy" is today (or anything still ahead); "Esta semana" is the previous six days. Older notices are left out. */
export function groupNotices(items: readonly NoticeItem[], today: IsoDate): NoticeGroups {
  const groups: NoticeGroups = { today: [], thisWeek: [] }
  for (const item of items) {
    const age = daysBetween(item.day, today)
    if (age <= 0) groups.today.push(item)
    else if (age < 7) groups.thisWeek.push(item)
  }
  return groups
}
