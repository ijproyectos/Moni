import { Bell, Copy } from 'lucide-react'
import mascotUrl from '@/assets/mascot/expresion_feliz.svg'
import { useProfile } from '@/features/auth/api/useProfile'
import { firstName } from '@/features/auth/domain/profile'
import { formatArs } from '@/shared/lib/money'
import { copyText } from '@/shared/lib/share'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import type { PaymentNotice } from '../mock/notificationsStore'

// Screen 022 — Recordarle un pago a alguien que te debe.
export function RemindSheet({
  notice,
  myAlias,
  onClose,
}: {
  notice: PaymentNotice
  myAlias: string
  onClose: () => void
}) {
  const toast = useToast()
  const { data: profile } = useProfile()
  const me = firstName(profile?.display_name) || 'Tu amigo'
  const title = `${me} te recuerda un pago`
  const body = `Le debés ${formatArs(notice.amountCents)} · ${notice.group}. Alias: ${myAlias}`

  return (
    <BottomSheet title={`Recordarle a ${notice.person}`} onClose={onClose}>
      <SectionLabel>Así le llega</SectionLabel>
      <div className="mt-2 rounded-[22px] border border-sand bg-card p-4 shadow-sm">
        <p className="flex items-center gap-2 text-[14px] text-text-muted">
          <img src={mascotUrl} alt="" className="size-6 rounded-md bg-lime" />
          <strong className="font-extrabold text-ink">Moni</strong> · ahora
        </p>
        <p className="mt-1 text-[18px] font-extrabold">{title}</p>
        <p className="text-[15px]">
          Le debés <strong className="font-extrabold">{formatArs(notice.amountCents)}</strong> ·{' '}
          {notice.group}. Alias: {myAlias}
        </p>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            toast.show(`Le avisamos a ${notice.person}`)
            onClose()
          }}
          className="flex min-h-14 flex-[1.6] items-center justify-center gap-2 rounded-full bg-lime text-[18px] font-extrabold"
        >
          <Bell aria-hidden="true" className="size-5" /> Mandar aviso
        </button>
        <button
          type="button"
          onClick={() => void copyText(`${title}. ${body}`, toast, 'Mensaje copiado')}
          className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full border-2 border-sand bg-card text-[18px] font-extrabold"
        >
          <Copy aria-hidden="true" className="size-5" /> Copiar
        </button>
      </div>
      <p className="mt-3 text-[15px] leading-5 text-text-muted">
        Si {notice.person} todavía no tiene Moni, copiá el mensaje y mandalo por donde quieras.
      </p>
    </BottomSheet>
  )
}
