import { SettingRow } from '@/shared/ui/SettingRow'
import { useRewards } from '../api/useSavings'
import { BADGES, earnedCount } from '../domain/badges'

/** Entry of the profile to "Mis logros", with how many badges the person has. */
export function AchievementsRow() {
  const rewards = useRewards()
  const count = rewards.data ? earnedCount(rewards.data.badges) : null
  return (
    <SettingRow
      title="Mis logros"
      trailing={count === null ? undefined : `${count} de ${BADGES.length}`}
      to="/logros"
    />
  )
}
