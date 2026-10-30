import { useState } from 'react'
import type { CatalogService } from '../domain/catalog'
import { CatalogSheet } from './CatalogSheet'
import { SubscriptionFormSheet } from './SubscriptionFormSheet'

type Step =
  { kind: 'catalog' } | { kind: 'form'; service: CatalogService } | { kind: 'custom'; name: string }

/** Catalog → form. Backing out of the form returns to the catalog. */
export function NewSubscriptionFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'catalog' })
  if (step.kind === 'catalog') {
    return (
      <CatalogSheet
        onPick={(service) => setStep({ kind: 'form', service })}
        onCustom={(name) => setStep({ kind: 'custom', name })}
        onClose={onClose}
      />
    )
  }
  return (
    <SubscriptionFormSheet
      target={
        step.kind === 'form'
          ? { kind: 'catalog', service: step.service }
          : { kind: 'custom', name: step.name }
      }
      onClose={() => setStep({ kind: 'catalog' })}
      onSaved={onClose}
    />
  )
}
