import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { FEATURES, type FeatureFlag } from '@/shared/config/features'

/** Renders its children only when the flag is on; otherwise sends the person home. */
export function FeatureGate({ flag, children }: { flag: FeatureFlag; children: ReactNode }) {
  if (!FEATURES[flag]) return <Navigate to="/" replace />
  return children
}
