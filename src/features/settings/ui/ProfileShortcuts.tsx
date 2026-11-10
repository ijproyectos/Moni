import { PieChart, Repeat, Target, Users, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { FEATURES } from '@/shared/config/features'
import { OptionRow, SectionLabel } from '@/shared/ui/kit'

interface Shortcut {
  to: string
  title: string
  subtitle: string
}

interface AccessTile {
  to: string
  title: string
  icon: LucideIcon
  tint: string
  fallback: string
}

/** The four accesses of Perfil, in the design's order and tints. */
const ACCESS: readonly AccessTile[] = [
  {
    to: '/metas',
    title: 'Presupuesto',
    icon: PieChart,
    tint: 'bg-tint-green text-mint-ink',
    fallback: 'Cuánto te queda en el mes',
  },
  {
    to: '/recurrentes?tab=gastos-fijos',
    title: 'Gastos fijos',
    icon: Repeat,
    tint: 'bg-tint-violet text-[#4A3F96] dark:text-ink',
    fallback: 'Lo que falta debitar',
  },
  {
    to: '/metas',
    title: 'Metas de ahorro',
    icon: Target,
    tint: 'bg-tint-gold text-[#5A4300] dark:text-ink',
    fallback: 'Tus ahorros',
  },
  {
    to: '/grupos',
    title: 'Grupos',
    icon: Users,
    tint: 'bg-tint-blue text-[#285A86] dark:text-ink',
    fallback: 'Gastos compartidos',
  },
]

/** Subtitles built from the person's real data; without one the tile keeps its plain description. */
export type AccessSubtitles = Partial<Record<(typeof ACCESS)[number]['title'], string>>

/** 2x2 grid of accesses to Presupuesto, Gastos fijos, Metas and Grupos. */
export function ProfileAccessGrid({ subtitles = {} }: { subtitles?: AccessSubtitles }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {ACCESS.map(({ to, title, icon: Icon, tint, fallback }) => (
        <Link
          key={title}
          to={to}
          className="flex min-w-0 flex-col gap-1.5 rounded-[18px] bg-card px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
        >
          <span
            aria-hidden="true"
            className={`flex size-[34px] shrink-0 items-center justify-center rounded-[11px] ${tint}`}
          >
            <Icon className="size-[15px]" strokeWidth={1.9} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium text-ink">{title}</span>
            <span className="block truncate text-[12px] text-text-muted">
              {subtitles[title] ?? fallback}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}

/** Everything that lives in /mas and has no place in the design, so no route is lost. Flags decide what exists. */
function moreTools(): Shortcut[] {
  return [
    { to: '/cuentas?tab=tarjetas', title: 'Tarjetas y cuotas', subtitle: 'Lo que viene' },
    { to: '/viajes', title: 'Viajes', subtitle: 'Presupuesto y gastos' },
    { to: '/hormigas', title: 'Gastos hormiga', subtitle: 'Esos gustitos que suman' },
    { to: '/este-mes', title: 'Informes', subtitle: 'Tu mes y tu año' },
    ...(FEATURES.debts
      ? [{ to: '/deudas', title: 'Deudas', subtitle: 'Lo que debés y te deben' }]
      : []),
    ...(FEATURES.aguinaldo
      ? [{ to: '/aguinaldo', title: 'Aguinaldo', subtitle: 'Repartilo' }]
      : []),
    ...(FEATURES.pro
      ? [{ to: '/pro', title: 'Integraciones', subtitle: 'Billeteras y bancos' }]
      : []),
    { to: '/categorias', title: 'Categorías', subtitle: 'Creá y editá las tuyas' },
    ...(FEATURES.referral
      ? [{ to: '/recomendar', title: 'Recomendar', subtitle: 'Los dos ganan 2 meses de Pro' }]
      : []),
  ]
}

/** "Más herramientas": the routes with no place in the design, kept at the end of Perfil. */
export function ProfileMoreTools() {
  return (
    <>
      <SectionLabel plain className="mt-1">
        Más herramientas
      </SectionLabel>
      <div className="divide-y divide-line overflow-hidden rounded-[24px] border border-line bg-card px-1">
        {moreTools().map((item) => (
          <OptionRow
            key={item.to + item.title}
            className="rounded-none border-0"
            title={item.title}
            subtitle={item.subtitle}
            to={item.to}
          />
        ))}
      </div>
    </>
  )
}
