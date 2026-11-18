import { useState } from 'react'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ChoiceChip } from '@/shared/ui/kit'
import {
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

const POINTS = [
  'Moni guarda solo lo necesario: importe, fecha, comercio o concepto y estado del pago.',
  'Nunca guardamos tu usuario ni tu contraseña de Mercado Pago.',
  'Podés desvincular tu cuenta cuando quieras, sin perder tus movimientos.',
]

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
      <div className="flex flex-col gap-3.5">
        <p className="text-[16px] leading-6 text-text-muted">
          Conectá tu cuenta y Moni registrará automáticamente tus gastos de Mercado Pago, incluso cuando no estés usando la app.
        </p>
        <ul className="flex flex-col gap-1.5 text-[15px] leading-[22px]">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden="true" className="text-[#009EE3]">•</span>
              {point}
            </li>
          ))}
        </ul>
        <div role="group" aria-label="Desde cuándo importar" className="grid grid-cols-3 gap-2">
          {IMPORT_WINDOWS.map((option) => (
            <ChoiceChip
              key={option.value}
              selected={window === option.value}
              onClick={() => setWindow(option.value)}
              className="min-h-11 px-2 text-[14px]"
            >
              {option.label}
            </ChoiceChip>
          ))}
        </div>
        <label className="flex items-start gap-3 text-[14px] leading-5">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[#009EE3]"
          />
          Entiendo y acepto cómo Moni usa mis datos de Mercado Pago.
        </label>
        {offline && <p className="text-center text-sm text-text-muted">{OFFLINE_MESSAGE}</p>}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => onConfirm(window)} disabled={!canConnect} className="bg-[#009EE3] text-white">
          Vincular con Mercado Pago
        </Button>
      </div>
    </BottomSheet>
  )
}
