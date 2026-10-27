import { BusFront, Mic, RefreshCw, Utensils, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import mascotUrl from '@/assets/mascot/personaje_carga-por-voz.svg'
import { formatArs } from '@/shared/lib/money'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { IconTile, SectionLabel } from '@/shared/ui/kit'

const EXAMPLE: {
  title: string
  category: string
  cents: number
  icon: LucideIcon
  bg: string
  color: string
}[] = [
  {
    title: 'Colectivo',
    category: 'Transporte',
    cents: 5_000_00,
    icon: BusFront,
    bg: '#d9ebe4',
    color: '#2f7d6f',
  },
  {
    title: 'Almuerzo',
    category: 'Comida',
    cents: 18_000_00,
    icon: Utensils,
    bg: '#fbdcd7',
    color: '#b8321f',
  },
  {
    title: 'Netflix',
    category: 'Suscripciones',
    cents: 8_000_00,
    icon: RefreshCw,
    bg: '#fdeab8',
    color: '#8a5a00',
  },
]

// Screen 020 — Carga por voz. Voice parsing is a Pro feature that does not exist yet: it explains and leads to Pro.
export function VoiceSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <BottomSheet title="Carga por voz" onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <img src={mascotUrl} alt="" className="size-32" />
        <h3 className="mt-2 font-display text-[28px] font-extrabold leading-8">
          Cargá varios gastos de una, hablando
        </h3>
        <p className="mt-2 text-[16px] leading-6 text-text-muted">
          Decí todo junto, como te salga. Moni separa cada gasto y lo pone en su categoría.
        </p>
      </div>
      <div className="mt-4 rounded-[24px] border border-sand bg-white p-4">
        <SectionLabel>Ejemplo</SectionLabel>
        <div className="mt-2 flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime">
            <Mic aria-hidden="true" className="size-5" />
          </span>
          <p className="rounded-[18px] bg-gold/25 px-4 py-3 text-left text-[16px] leading-6">
            “Gasté 5 lucas en el bondi, 18 en el almuerzo y pagué 8 de Netflix”
          </p>
        </div>
        <ul className="mt-2 divide-y divide-sand">
          {EXAMPLE.map((e) => (
            <li key={e.title} className="flex items-center gap-3 py-2.5">
              <IconTile icon={e.icon} bg={e.bg} color={e.color} />
              <span className="flex-1 text-left">
                <span className="block text-[18px] font-extrabold">{e.title}</span>
                <span className="block text-[15px] text-text-muted">{e.category}</span>
              </span>
              <span className="rounded-full bg-blush/50 px-3 py-1 text-[16px] font-extrabold text-expense">
                {formatArs(-e.cents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Button
        variant="dark"
        className="mt-4"
        onClick={() => {
          onClose()
          navigate('/pro')
        }}
      >
        Probar ahora
      </Button>
      <p className="mt-3 text-center text-[14px] leading-5 text-text-muted">
        También entiende cuotas, gastos fijos, aportes a metas y gastos de viaje.
      </p>
    </BottomSheet>
  )
}
