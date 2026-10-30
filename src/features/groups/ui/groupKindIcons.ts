import { Heart, House, UsersRound, type LucideIcon } from 'lucide-react'
import type { GroupKind } from '@/shared/lib/database.types'

export const GROUP_KIND_ICONS: Record<GroupKind, LucideIcon> = {
  casa: House,
  viaje: UsersRound,
  pareja: Heart,
  amigos: UsersRound,
}
