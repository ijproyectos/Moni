import {
  BADGES,
  badgeDef,
  collection,
  earnedCount,
  hasCelebration,
  parseAchievements,
  parseBadges,
  pendingCelebration,
} from './badges'
import { badgeImage } from './badgeImages'

const earned = (key: string, seen = true, over = {}) => ({
  key,
  goalName: 'Computadora',
  targetCents: 3_000_000_00,
  earnedAt: '2027-01-15T15:00:00Z',
  seen,
  ...over,
})

describe('the badge catalog', () => {
  it('has the ten badges with stable keys, names, hints and congratulations', () => {
    expect(BADGES).toHaveLength(10)
    expect(new Set(BADGES.map((b) => b.key)).size).toBe(10)
    for (const b of BADGES) {
      expect(b.key).toMatch(/^[a-z0-9-]+$/)
      expect(b.name.length).toBeGreaterThan(2)
      expect(b.hint.length).toBeGreaterThan(5)
      expect(b.congrats.length).toBeGreaterThan(5)
    }
    expect(badgeDef('primera-meta')?.name).toBe('Primera meta cumplida')
    expect(badgeDef('nope')).toBeUndefined()
  })

  it('every badge has its picture in the project, found by key (never by the name of a goal)', () => {
    for (const b of BADGES) expect(badgeImage(b.key), b.key).toBeTruthy()
    expect(badgeImage('Computadora')).toBeNull()
  })
})

describe('collection', () => {
  it('lists every badge in order and marks only the earned ones', () => {
    const items = collection([earned('primer-aporte'), earned('primera-meta')])
    expect(items.map((i) => i.def.key)).toEqual(BADGES.map((b) => b.key))
    expect(items.filter((i) => i.earned).map((i) => i.def.key)).toEqual([
      'primera-meta',
      'primer-aporte',
    ])
  })

  it('counts what was earned and never invents', () => {
    expect(earnedCount([])).toBe(0)
    expect(earnedCount([earned('primer-aporte'), earned('desconocida')])).toBe(1)
  })
})

describe('what to celebrate', () => {
  const ach = (seen: boolean) => ({
    id: 'a',
    goalId: 'g',
    goalName: 'Casa',
    targetCents: 1_00,
    reachedAt: '2027-01-01T00:00:00Z',
    seen,
  })
  it('only what has not been seen yet', () => {
    const c = pendingCelebration(
      [ach(false), ach(true)],
      [earned('primera-meta', false), earned('primer-aporte', true)],
    )
    expect(c.achievements).toHaveLength(1)
    expect(c.badges.map((b) => b.def.key)).toEqual(['primera-meta'])
    expect(hasCelebration(c)).toBe(true)
  })
  it('nothing pending means no celebration', () => {
    expect(hasCelebration(pendingCelebration([ach(true)], [earned('primera-meta', true)]))).toBe(
      false,
    )
  })
  it('ignores a badge the app does not know', () => {
    expect(pendingCelebration([], [earned('futura', false)]).badges).toEqual([])
  })
})

describe('parsing what the database returns', () => {
  it('converts amounts to cents and seen flags', () => {
    expect(
      parseBadges([
        {
          badge_key: 'primera-meta',
          goal_name: 'PC',
          target_amount: '3000000.00',
          earned_at: '2027-01-15T15:00:00Z',
          seen_at: null,
        },
      ]),
    ).toEqual([
      {
        key: 'primera-meta',
        goalName: 'PC',
        targetCents: 3_000_000_00,
        earnedAt: '2027-01-15T15:00:00Z',
        seen: false,
      },
    ])
    expect(
      parseBadges([
        { badge_key: 'x', goal_name: null, target_amount: null, earned_at: 'z', seen_at: 'now' },
      ])[0],
    ).toMatchObject({ goalName: null, targetCents: null, seen: true })
    expect(
      parseAchievements([
        {
          id: 'a',
          goal_id: null,
          goal_name: 'Casa',
          target_amount: 100,
          reached_at: 'z',
          seen_at: null,
        },
      ])[0],
    ).toMatchObject({ goalId: null, targetCents: 10_000, seen: false })
  })
})
