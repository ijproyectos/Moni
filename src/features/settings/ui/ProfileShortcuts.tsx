import { FEATURES } from '@/shared/config/features'
import { OptionRow, SectionLabel } from '@/shared/ui/kit'

interface Shortcut {
  to: string
  title: string
  subtitle: string
}

/** Quick access to the sections that left the bottom bar. */
const MAIN_SHORTCUTS: readonly Shortcut[] = [
  { to: '/metas', title: 'Presupuesto', subtitle: 'Cuánto te queda en el mes' },
  { to: '/recurrentes?tab=gastos-fijos', title: 'Gastos fijos', subtitle: 'Lo que falta debitar' },
  { to: '/metas', title: 'Metas', subtitle: 'Tus ahorros' },
  { to: '/grupos', title: 'Grupos', subtitle: 'Gastos compartidos' },
  {
    to: '/cuentas',
    title: FEATURES.accountAlias ? 'Medios de pago y alias' : 'Medios de pago',
    subtitle: 'Cuentas y tarjetas',
  },
  { to: '/cuentas?tab=tarjetas', title: 'Tarjetas y cuotas', subtitle: 'Lo que viene' },
]

/** Everything that lives in /mas and has no tab of its own, so no route is lost. Flags decide what exists. */
function moreTools(): Shortcut[] {
  return [
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

function ShortcutList({ items }: { items: readonly Shortcut[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-[24px] border border-line bg-card px-1">
      {items.map((item) => (
        <OptionRow
          key={item.to + item.title}
          className="rounded-none border-0"
          title={item.title}
          subtitle={item.subtitle}
          to={item.to}
        />
      ))}
    </div>
  )
}

/** Perfil sections: the four former shortcuts plus payment media, and "Más herramientas". */
export function ProfileShortcuts() {
  return (
    <>
      <SectionLabel plain className="mt-1">
        Accesos
      </SectionLabel>
      <ShortcutList items={MAIN_SHORTCUTS} />
      <SectionLabel plain className="mt-1">
        Más herramientas
      </SectionLabel>
      <ShortcutList items={moreTools()} />
    </>
  )
}
