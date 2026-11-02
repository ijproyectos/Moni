import { getSupabase } from '@/shared/lib/supabase'
import {
  parseAchievements,
  parseBadges,
  type EarnedBadge,
  type GoalAchievement,
} from '../domain/badges'
import { parsePlanData, type PlanData } from '../domain/savingsPlan'

/** Month by month history of every goal, for the progress chart. */
export async function getSavingsPlanData(): Promise<PlanData> {
  const { data, error } = await getSupabase().rpc('get_savings_plan_data')
  if (error) throw error
  return parsePlanData(data)
}

export interface Rewards {
  badges: EarnedBadge[]
  achievements: GoalAchievement[]
}

/** What the person earned. The catch-up only records what the database rules already grant; it never duplicates. */
export async function getRewards(): Promise<Rewards> {
  const supabase = getSupabase()
  // Best effort: an older database without the rewards simply has none.
  await supabase.rpc('claim_goal_rewards')
  const [badges, achievements] = await Promise.all([
    supabase.from('user_badges').select('*').order('earned_at', { ascending: true }),
    supabase.from('goal_achievements').select('*').order('reached_at', { ascending: true }),
  ])
  if (badges.error) throw badges.error
  if (achievements.error) throw achievements.error
  return { badges: parseBadges(badges.data), achievements: parseAchievements(achievements.data) }
}

export async function markRewardsSeen(): Promise<void> {
  const { error } = await getSupabase().rpc('mark_goal_rewards_seen')
  if (error) throw error
}
