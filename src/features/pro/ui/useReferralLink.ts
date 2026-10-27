import { useProfile } from '@/features/auth/api/useProfile'
import { firstName } from '@/features/auth/domain/profile'

/** Personal referral link (simulated). */
export function useReferralLink(): string {
  const { data: profile } = useProfile()
  const slug = (firstName(profile?.display_name) || 'vos')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '')
  return `moni.app/r/${slug || 'vos'}-4x2k`
}
