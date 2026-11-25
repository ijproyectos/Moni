import { X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import mascot from '@/assets/mascot/expresion_atento.svg'
import { useMpConnection } from '@/features/mpImport/api/useMpImport'
import { toUserMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { useModal } from '@/shared/ui/useModal'
import { deleteAccount, DELETE_CONFIRMATION_WORD, isDeleteConfirmed } from '../api/deleteAccount'

export const DELETE_ACCOUNT_TITLE = '¿Seguro que querés eliminar tu cuenta?'
export const DELETE_ACCOUNT_TEXT =
  'Si eliminás tu cuenta, perderás permanentemente tus datos personales, ingresos, gastos, medios de pago, ahorros, metas y configuraciones. También dejarás de formar parte de tus grupos y viajes compartidos. Esta acción no se puede deshacer'

/**
 * «Eliminar cuenta»: first the question (with Moni), then a second confirmation that asks to type ELIMINAR. Nothing is deleted until
 * that word matches and the server answers that the WHOLE deletion finished; until then the dialog stays, shows the error and lets
 * the person retry. `onDeleted` runs only after real success (closing the session, wiping local data and leaving are done there).
 */
export function DeleteAccountDialog({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<'ask' | 'confirm'>('ask')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mercado Pago has no way for an app to revoke its own permission: Moni deletes its token, the person can also remove the permission.
  const mp = useMpConnection()
  // While the deletion runs the dialog cannot be dismissed (Escape, scrim, X): closing mid-way would hide what is happening.
  // (useModal keeps the first callback it gets, so the current state is read through a ref.)
  const busyRef = useRef(false)
  busyRef.current = busy
  useModal(panelRef, () => {
    if (!busyRef.current) onClose()
  })

  async function confirm() {
    if (busy || !isDeleteConfirmed(typed)) return
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(typed.trim())
    } catch (e) {
      setError(toUserMessage(e))
      setBusy(false)
      return
    }
    onDeleted()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 py-[max(env(safe-area-inset-top),20px)]">
      <div aria-hidden="true" onClick={busy ? undefined : onClose} className="absolute inset-0 bg-scrim motion-safe:animate-[fade-in_150ms_ease-out]" />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-delete-account={step}
        className="relative flex max-h-full w-full max-w-[360px] flex-col items-center overflow-y-auto rounded-[32px] bg-canvas px-6 pb-6 pt-5 text-center shadow-[0_24px_60px_rgba(12,36,24,0.35)] outline-none dark:border dark:border-line motion-safe:animate-[sheet-in_220ms_ease-out]"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Cerrar"
          className={cn('absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-card text-ink disabled:opacity-40', FOCUS_RING)}
        >
          <X aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
        </button>
        <img src={mascot} alt="" draggable={false} className="mt-2 size-[104px] rounded-full bg-tint-red object-contain p-2" />

        {step === 'ask' ? (
          <>
            <h2 id={titleId} className="mt-3 font-display text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink">
              {DELETE_ACCOUNT_TITLE}
            </h2>
            <p className="mt-2 text-[15px] leading-6 text-text-muted">{DELETE_ACCOUNT_TEXT}.</p>
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              className={cn('mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-[#1B3A2E] px-5 text-[16px] font-extrabold text-[#F1EEDD] dark:bg-[#F1EEDD] dark:text-[#0E1A13]', FOCUS_RING)}
            >
              Conservar mi cuenta
            </button>
            <button
              type="button"
              onClick={() => setStep('confirm')}
              className={cn('mt-2 flex min-h-12 w-full items-center justify-center rounded-full bg-expense px-5 text-[16px] font-extrabold text-cream', FOCUS_RING)}
            >
              Eliminar mi cuenta
            </button>
          </>
        ) : (
          <>
            <h2 id={titleId} className="mt-3 font-display text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink">
              Una última confirmación
            </h2>
            <p className="mt-2 text-[15px] leading-6 text-text-muted">
              Para eliminar tu cuenta para siempre, escribí <strong className="text-ink">{DELETE_CONFIRMATION_WORD}</strong>.
            </p>
            {mp.data && (
              <p className="mt-3 text-[13px] leading-5 text-text-muted">
                Borramos tu vinculación con Mercado Pago. Si querés, también podés quitar el permiso de Moni desde tu cuenta de Mercado Pago
                (Seguridad › Aplicaciones conectadas).
              </p>
            )}
            <label className="mt-4 w-full text-left">
              <span className="sr-only">Escribí {DELETE_CONFIRMATION_WORD} para confirmar</span>
              <input
                data-autofocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={busy}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                maxLength={20}
                placeholder={DELETE_CONFIRMATION_WORD}
                aria-label={`Escribí ${DELETE_CONFIRMATION_WORD} para confirmar`}
                className={cn('h-12 w-full rounded-[18px] border border-line bg-card px-4 text-center text-[17px] font-bold tracking-[0.1em] text-ink placeholder:font-semibold placeholder:text-text-muted', FOCUS_RING)}
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-[14px] leading-5 text-expense">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy || !isDeleteConfirmed(typed)}
              className={cn('mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-expense px-5 text-[16px] font-extrabold text-cream disabled:opacity-50', FOCUS_RING)}
            >
              {busy ? 'Eliminando tu cuenta…' : 'Eliminar mi cuenta'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={cn('mt-1 min-h-11 rounded-full px-4 text-[15px] font-semibold text-text-muted disabled:opacity-50', FOCUS_RING)}
            >
              Conservar mi cuenta
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
