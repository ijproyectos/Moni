import { useState } from 'react'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ChoiceChip } from '@/shared/ui/kit'
import {
  CONSENT_POINTS,
  DEFAULT_IMPORT_WINDOW,
  IMPORT_WINDOWS,
  type ImportWindow,
} from '../domain/mpImport'

interface MpConsentSheetProps {
  onClose: () => void
  /** Called only after the explicit acceptance, with the chosen import window. */
  onConfirm: (window: ImportWindow) => void
  isPending?: boolean
  error?: string | null
  offline?: boolean
}

/** Consent before leaving for Mercado Pago (R1.2, R1.3): what is sent where, the import window, and the checkbox. */
export function MpConsentSheet({
  onClose,
  onConfirm,
  isPending,
  error,
  offline,
}: MpConsentSheetProps) {
  const [accepted, setAccepted] = useState(false)
  const [window, setWindow] = useState<ImportWindow>(DEFAULT_IMPORT_WINDOW)
  const canConnect = accepted && !isPending && !offline

  return (
    <BottomSheet title="Vincular Mercado Pago" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2 text-[16px] leading-6">
          {CONSENT_POINTS.map((point) => (
            <li key={point}>· {point}</li>
          ))}
        </ul>
        <div role="group" aria-label="Desde cuándo importar" className="flex flex-wrap gap-2">
          {IMPORT_WINDOWS.map((option) => (
            <ChoiceChip
              key={option.value}
              selected={window === option.value}
              onClick={() => setWindow(option.value)}
            >
              {option.label}
            </ChoiceChip>
          ))}
        </div>
        <label className="flex items-start gap-3 text-[16px] leading-6">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 size-5 shrink-0 accent-forest"
          />
          Entiendo y acepto cómo Moni usa mis datos de Mercado Pago.
        </label>
        {offline && <p className="text-center text-sm text-text-muted">{OFFLINE_MESSAGE}</p>}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => onConfirm(window)} disabled={!canConnect}>
          Vincular con Mercado Pago
        </Button>
      </div>
    </BottomSheet>
  )
}
