import { Award } from 'lucide-react'
import { OptionRow, IconTile } from '@/shared/ui/kit'
import { useRewards } from '../api/useSavings'
import { BADGES, earnedCount } from '../domain/badges'

/** Entry of the profile to "Mis logros", with how many badges the person has. */
export function AchievementsRow() {
  const rewards = useRewards()
  const count = rewards.data ? earnedCount(rewards.data.badges) : null
  return (
    <OptionRow
      className="rounded-none border-0"
      icon={<IconTile icon={Award} bg="#fbdcd7" className="size-11" />}
      title="Mis logros"
      subtitle={
        count === null
          ? 'Tus insignias por cumplir metas'
          : `${count} de ${BADGES.length} insignias`
      }
      to="/logros"
    />
  )
}
