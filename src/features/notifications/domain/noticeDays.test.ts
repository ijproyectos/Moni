import { groupByDay, noticeDay, noticeStamp, noticeTime } from './noticeDays'

describe('noticeDays', () => {
  it('keeps the day of a date-only value and has no time for it', () => {
    expect(noticeDay('2026-11-20T00:00:00Z', false)).toBe('2026-11-20')
    expect(noticeTime('2026-11-20T00:00:00Z', false)).toBeNull()
    expect(noticeStamp('2026-11-20T00:00:00Z', '2026-11-23', false)).toBe('20 nov')
  })

  it('shows Hoy and Ayer with the local time of a timestamp', () => {
    const at = new Date(2026, 10, 23, 14, 5).toISOString()
    expect(noticeTime(at)).toBe('14:05')
    expect(noticeStamp(at, '2026-11-23')).toBe('Hoy · 14:05')
    expect(noticeStamp(at, '2026-11-24')).toBe('Ayer · 14:05')
  })

  it('groups newest day first with Hoy, Ayer and earlier dates', () => {
    const items = [
      { id: 'a', day: '2026-11-21' },
      { id: 'b', day: '2026-11-23' },
      { id: 'c', day: '2026-11-22' },
      { id: 'd', day: '2026-11-23' },
    ]
    const groups = groupByDay(items, (i) => i.day, '2026-11-23')
    expect(groups.map((g) => g.label)).toEqual(['Hoy', 'Ayer', '21 nov'])
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['b', 'd'])
  })
})
