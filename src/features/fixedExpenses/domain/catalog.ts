import {
  Building2,
  Flame,
  GraduationCap,
  Home,
  Landmark,
  Package,
  ShieldCheck,
  Smartphone,
  Wifi,
  Zap,
  Droplets,
  type LucideIcon,
} from 'lucide-react'

export interface FixedKind {
  /** Stable identifier, saved with the fixed expense. */
  id: string
  name: string
  icon: LucideIcon
  /** "tu factura de luz": kinds that arrive as a bill. Others are named as they are ("tu alquiler"). */
  bill: boolean
  /** Expense-category names that suit it, to preselect one (the person can change it). */
  categoryHints: readonly string[]
}

export const CUSTOM_KIND_ID = 'custom'

export const FIXED_KINDS: readonly FixedKind[] = [
  {
    id: 'luz',
    name: 'Luz',
    icon: Zap,
    bill: true,
    categoryHints: ['servicios', 'hogar', 'casa', 'vivienda'],
  },
  {
    id: 'agua',
    name: 'Agua',
    icon: Droplets,
    bill: true,
    categoryHints: ['servicios', 'hogar', 'casa', 'vivienda'],
  },
  {
    id: 'gas',
    name: 'Gas',
    icon: Flame,
    bill: true,
    categoryHints: ['servicios', 'hogar', 'casa', 'vivienda'],
  },
  {
    id: 'internet',
    name: 'Internet',
    icon: Wifi,
    bill: true,
    categoryHints: ['servicios', 'hogar', 'tecnología', 'tecnologia'],
  },
  {
    id: 'celular',
    name: 'Celular',
    icon: Smartphone,
    bill: true,
    categoryHints: ['servicios', 'tecnología', 'tecnologia'],
  },
  {
    id: 'alquiler',
    name: 'Alquiler',
    icon: Home,
    bill: false,
    categoryHints: ['alquiler', 'hogar', 'casa', 'vivienda'],
  },
  {
    id: 'expensas',
    name: 'Expensas',
    icon: Building2,
    bill: false,
    categoryHints: ['expensas', 'hogar', 'casa', 'vivienda'],
  },
  {
    id: 'seguros',
    name: 'Seguros',
    icon: ShieldCheck,
    bill: false,
    categoryHints: ['seguros', 'servicios', 'salud'],
  },
  {
    id: 'educacion',
    name: 'Educación',
    icon: GraduationCap,
    bill: false,
    categoryHints: ['educación', 'educacion', 'estudios'],
  },
  {
    id: 'impuestos',
    name: 'Impuestos y tasas',
    icon: Landmark,
    bill: false,
    categoryHints: ['impuestos', 'servicios', 'hogar'],
  },
  {
    id: 'otros',
    name: 'Otros gastos fijos',
    icon: Package,
    bill: false,
    categoryHints: ['servicios', 'hogar', 'otros'],
  },
]

const BY_ID = new Map(FIXED_KINDS.map((kind) => [kind.id, kind]))

export function findKind(id: string): FixedKind | undefined {
  return BY_ID.get(id)
}

/**
 * How the bill is named in a sentence: "tu factura de luz" for utilities, the plain name for the rest
 * ("tu alquiler", "Patente").
 */
export function billLabel(kindId: string, name: string): string {
  const kind = findKind(kindId)
  return kind?.bill ? `tu factura de ${name.toLowerCase()}` : name
}
