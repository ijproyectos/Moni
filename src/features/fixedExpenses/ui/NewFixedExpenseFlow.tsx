import { useState } from 'react'
import type { FixedKind } from '../domain/catalog'
import { FixedCatalogSheet } from './FixedCatalogSheet'
import { FixedExpenseFormSheet } from './FixedExpenseFormSheet'

type Step = { kind: 'catalog' } | { kind: 'form'; fixed: FixedKind } | { kind: 'custom' }

/** Catalog → form. Backing out of the form returns to the catalog. */
export function NewFixedExpenseFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'catalog' })
  if (step.kind === 'catalog') {
    return (
      <FixedCatalogSheet
        onPick={(fixed) => setStep({ kind: 'form', fixed })}
        onCustom={() => setStep({ kind: 'custom' })}
        onClose={onClose}
      />
    )
  }
  return (
    <FixedExpenseFormSheet
      target={step.kind === 'form' ? { kind: 'catalog', fixed: step.fixed } : { kind: 'custom' }}
      onClose={() => setStep({ kind: 'catalog' })}
      onSaved={onClose}
    />
  )
}
