import { groupNotices, type NoticeItem } from './notificationFeed'

const item = (key: string, day: string): NoticeItem => ({
  key,
  tone: 'gold',
  title: key,
  day,
  to: '/',
})

describe('groupNotices', () => {
  it('splits today from the rest of the week and drops older ones', () => {
    const groups = groupNotices(
      [item('a', '2026-11-10'), item('b', '2026-11-05'), item('c', '2026-11-03'), item('d', '2026-11-11')],
      '2026-11-10',
    )
    expect(groups.today.map((i) => i.key)).toEqual(['a', 'd'])
    expect(groups.thisWeek.map((i) => i.key)).toEqual(['b'])
  })

  it('is empty when there is nothing', () => {
    expect(groupNotices([], '2026-11-10')).toEqual({ today: [], thisWeek: [] })
  })
})
