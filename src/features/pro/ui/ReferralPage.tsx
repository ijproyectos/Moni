import { Copy, Upload } from 'lucide-react'
import { useState } from 'react'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { useReferralLink } from './useReferralLink'
import { copyText } from '@/shared/lib/share'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { Avatar, MoniCalcCard, Page, Panel, SectionLabel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { ShareLinkSheet } from '@/shared/ui/ShareLinkSheet'
import { useToast } from '@/shared/ui/toastContext'

const INVITES = [
  { name: 'Fran', status: 'Se registró con tu link', badge: '+2 meses', done: true },
  { name: 'Lu', status: 'Le mandaste el link', badge: 'Pendiente', done: false },
]

// Screen 124 — Recomendá Moni (2 meses gratis).
export function ReferralPage() {
  const toast = useToast()
  const link = useReferralLink()
  const [sharing, setSharing] = useState(false)
  return (
    <Page className="pb-28">
      <PageHeader title="Recomendá Moni" backTo="/mas" />
      <MoniCalcCard label="Regalá y ganá" mascot={mascotGroup} title="2 meses de Moni Pro gratis" />
      <p className="text-[16px] leading-6">
        Por cada amigo que se registre con tu link, los dos se llevan 2 meses de Pro. Sin límite de
        amigos.
      </p>
      <Panel>
        <SectionLabel>Tu link</SectionLabel>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-[19px] font-extrabold">{link}</span>
          <button
            type="button"
            onClick={() => void copyText(`https://${link}`, toast, 'Link copiado')}
            className="flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-forest px-4 text-[16px] font-extrabold text-cream"
          >
            <Copy aria-hidden="true" className="size-5" /> Copiar
          </button>
        </div>
      </Panel>
      <ol className="flex flex-col gap-3 px-1">
        {[
          'Compartís tu link',
          'Tu amigo se descarga Moni y se registra',
          'Los dos reciben 2 meses de Pro',
        ].map((step, i) => (
          <li key={step} className="flex items-center gap-3 text-[16px]">
            <span className="flex size-7 items-center justify-center rounded-full bg-lime text-[14px] font-extrabold">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <Panel>
        <SectionLabel
          action={
            <span className="rounded-full bg-lime/40 px-3 py-0.5 text-[13px] font-extrabold">
              Ganaste 2 meses
            </span>
          }
        >
          Tus invitaciones
        </SectionLabel>
        <ul className="mt-2 divide-y divide-sand">
          {INVITES.map((inv) => (
            <li key={inv.name} className="flex items-center gap-3 py-2.5">
              <Avatar name={inv.name} />
              <span className="flex-1">
                <span className="block text-[17px] font-extrabold">{inv.name}</span>
                <span className="block text-[14px] text-text-muted">{inv.status}</span>
              </span>
              <span
                className={cn(
                  'rounded-full px-3 py-0.5 text-[13px] font-extrabold',
                  inv.done ? 'bg-lime/40' : 'bg-gold/40',
                )}
              >
                {inv.badge}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button onClick={() => setSharing(true)}>
          <Upload aria-hidden="true" className="mr-2 size-5" /> Compartir mi link
        </Button>
      </div>
      {sharing && (
        <ShareLinkSheet
          title="Compartir mi link"
          message="Probá Moni, la app para llevar tus gastos tranquila. Con mi link los dos nos llevamos 2 meses de Moni Pro gratis."
          url={`https://${link}`}
          onClose={() => setSharing(false)}
        />
      )}
    </Page>
  )
}
