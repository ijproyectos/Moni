import { Bell, CalendarDays, Clock, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import mascotUrl from '@/assets/mascot/expresion_picaro.svg'
import { formatArs } from '@/shared/lib/money'
import { Button } from '@/shared/ui/Button'
import { MoniGlyph, Toggle } from '@/shared/ui/kit'
import { updateWeeklyDigest, useWeeklyDigestSettings } from '../mock/antsData'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const TIMES = ['08:00', '12:00', '18:00', '20:00', '22:00']
const LIMITS = [3_000_00, 5_000_00, 8_000_00, 10_000_00]

function cycle<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length] ?? current
}

// Screen 032 — Aviso semanal (resumen de gastos hormiga).
export function WeeklyDigestPage() {
  const navigate = useNavigate()
  const s = useWeeklyDigestSettings()

  const rows = [
    {
      icon: CalendarDays,
      title: 'Día',
      value: s.day,
      onClick: () => updateWeeklyDigest({ day: cycle(DAYS, s.day) }),
    },
    {
      icon: Clock,
      title: 'Hora',
      value: s.time,
      onClick: () => updateWeeklyDigest({ time: cycle(TIMES, s.time) }),
    },
  ]

  return (
    <main className="min-h-dvh bg-forest px-4 pb-8 pt-10 text-cream">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          Así te llega
        </p>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => navigate(-1)}
          className="flex size-10 items-center justify-center rounded-full bg-surface"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="mt-3 flex gap-3 rounded-[24px] bg-cream p-4 text-forest shadow-lg">
        <img src={mascotUrl} alt="" className="size-12 rounded-[12px] bg-lime p-1" />
        <div className="min-w-0 flex-1">
          <p className="flex justify-between text-[13px] font-extrabold uppercase tracking-wide">
            <span>Moni</span>
            <span className="normal-case tracking-normal">ahora</span>
          </p>
          <p className="text-[17px] font-extrabold">Tu semana hormiga</p>
          <p className="text-[15px] leading-5 text-text-muted">
            Gastaste $36.000 en cositas chicas, 7% más que la semana pasada. Los cafés pasaron de 4
            a 6.
          </p>
        </div>
      </div>

      <h1 className="mt-8 font-display text-[32px] font-extrabold">Resumen semanal</h1>
      <p className="mt-1 text-[16px] leading-6 text-text-muted-on-dark">
        Cada domingo Moni te cuenta qué cambió y dónde se te van las monedas chicas. Sin retos.
      </p>

      <ul className="mt-5 divide-y divide-white/10 rounded-[24px] bg-surface">
        <li className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-forest/60">
            <Bell aria-hidden="true" className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[17px] font-extrabold">Avisarme cada semana</span>
            <span className="block text-[14px] text-text-muted-on-dark">Gastos hormiga</span>
          </span>
          <Toggle
            label="Avisarme cada semana"
            checked={s.enabled}
            onChange={(enabled) => updateWeeklyDigest({ enabled })}
          />
        </li>
        {rows.map((row) => (
          <li key={row.title} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-forest/60">
              <row.icon aria-hidden="true" className="size-5" />
            </span>
            <span className="flex-1 text-[17px] font-extrabold">{row.title}</span>
            <button
              type="button"
              onClick={row.onClick}
              className="min-h-11 rounded-full bg-forest/60 px-4 text-[16px] font-extrabold"
            >
              {row.value}
            </button>
          </li>
        ))}
        <li className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-forest/60 text-lime">
            <MoniGlyph className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[17px] font-extrabold">Cuenta como chico</span>
            <span className="block text-[14px] text-text-muted-on-dark">
              Y se repite 3 veces o más
            </span>
          </span>
          <button
            type="button"
            onClick={() =>
              updateWeeklyDigest({ smallLimitCents: cycle(LIMITS, s.smallLimitCents) })
            }
            className="min-h-11 rounded-full bg-forest/60 px-4 text-[16px] font-extrabold"
          >
            Hasta {formatArs(s.smallLimitCents)}
          </button>
        </li>
      </ul>

      <Button className="mt-8" onClick={() => navigate('/hormigas')}>
        Ver el resumen de esta semana
      </Button>
    </main>
  )
}
