import { X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import alerta from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import asistente from '@/assets/mascot/personaje_asistente.svg'
import cargaDinero from '@/assets/mascot/personaje_carga-de-dinero.svg'
import cargaVoz from '@/assets/mascot/personaje_carga-por-voz.svg'
import gastosGrupo from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import informe from '@/assets/mascot/personaje_informe-del-mes.svg'
import metas from '@/assets/mascot/personaje_metas-de-ahorro.svg'
import notificaciones from '@/assets/mascot/personaje_notificaciones.svg'
import analista from '@/assets/mascot/expresion_analista.svg'
import atento from '@/assets/mascot/expresion_atento.svg'
import feliz from '@/assets/mascot/expresion_feliz.svg'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { useModal } from '@/shared/ui/useModal'
import { reasonOf, type PlusFeature } from '../domain/entitlements'
import { PLUS_PROMO, type PromoMascot } from '../domain/promoCopy'
import { PlusSheet } from './PlusSheet'

const MASCOTS: Record<PromoMascot, string> = {
  'carga-de-dinero': cargaDinero,
  'carga-por-voz': cargaVoz,
  asistente,
  'gastos-en-grupo': gastosGrupo,
  notificaciones,
  'metas-de-ahorro': metas,
  analista,
  feliz,
  alerta,
  atento,
  informe,
}

/**
 * The pop-up that introduces ONE Moni Plus capability to a Free person: Moni (the original drawings), a small «MONI PLUS» label, a
 * title and a short first-person text that change with the capability. «Conocer Moni Plus» goes to the real Plus screen (plans and
 * checkout); «Ahora no» and the X just close it and leave everything as it was.
 */
export function PlusPromoDialog({ feature, onClose }: { feature: PlusFeature; onClose: () => void }) {
  const copy = PLUS_PROMO[feature]
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [plans, setPlans] = useState(false)
  useModal(panelRef, onClose)

  if (plans) return <PlusSheet reason={reasonOf(feature)} onClose={onClose} />

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 py-[max(env(safe-area-inset-top),20px)]">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-scrim motion-safe:animate-[fade-in_150ms_ease-out]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-plus-promo={feature}
        className="relative flex max-h-full w-full max-w-[360px] flex-col items-center overflow-y-auto rounded-[32px] bg-canvas px-6 pb-6 pt-5 text-center shadow-[0_24px_60px_rgba(12,36,24,0.35)] outline-none dark:border dark:border-line motion-safe:animate-[sheet-in_220ms_ease-out]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className={cn('absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-card text-ink', FOCUS_RING)}
        >
          <X aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
        </button>
        <img
          src={MASCOTS[copy.mascot]}
          alt=""
          draggable={false}
          className="mt-2 size-[112px] rounded-full bg-tint-gold object-contain p-2"
        />
        <span className="mt-3 inline-flex h-[22px] items-center rounded-full border border-[#E3B23C]/60 bg-[#F8EDC4] px-3 indent-[0.08em] text-[11px] font-extrabold leading-none tracking-[0.1em] text-[#6B4E00] dark:border-[#E3B23C]/40 dark:bg-[#3A2F10] dark:text-[#F0D58A]">
          MONI PLUS
        </span>
        <h2 id={titleId} className="mt-3 font-display text-[24px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink">
          {copy.title}
        </h2>
        <p className="mt-2 text-[15.5px] leading-6 text-text-muted">{copy.text}</p>
        <button
          type="button"
          data-autofocus
          onClick={() => setPlans(true)}
          className={cn(
            'mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-[#1B3A2E] px-5 text-[16px] font-extrabold text-[#F1EEDD] dark:bg-[#F1EEDD] dark:text-[#0E1A13]',
            FOCUS_RING,
          )}
        >
          Conocer Moni Plus
        </button>
        <button type="button" onClick={onClose} className={cn('mt-1 min-h-11 rounded-full px-4 text-[15px] font-semibold text-text-muted', FOCUS_RING)}>
          Ahora no
        </button>
      </div>
    </div>,
    document.body,
  )
}
