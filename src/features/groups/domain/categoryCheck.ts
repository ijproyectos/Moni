/**
 * Flags a shared expense whose saved category looks wrong for what it says it is ("Remera" saved as Comida). It only tells; the stored
 * category is never changed here, and an expense with no category or with an unknown description is never flagged.
 */
const GROUPS: ReadonlyArray<{ words: readonly string[]; fits: readonly string[] }> = [
  {
    words: ['remera', 'pantalon', 'jean', 'campera', 'zapatilla', 'zapato', 'ropa', 'vestido', 'camisa', 'buzo', 'medias', 'calzado'],
    fits: ['ropa', 'otros'],
  },
  {
    words: ['almuerzo', 'cena', 'pizza', 'hamburguesa', 'empanada', 'restaurante', 'asado', 'helado', 'desayuno', 'delivery', 'sushi'],
    fits: ['comida', 'salidas', 'super', 'otros'],
  },
  { words: ['nafta', 'uber', 'taxi', 'colectivo', 'subte', 'peaje', 'estacionamiento', 'cabify'], fits: ['transporte', 'viajes', 'otros'] },
  { words: ['farmacia', 'medico', 'medicina', 'remedio', 'dentista', 'consulta'], fits: ['salud', 'otros'] },
  { words: ['alquiler', 'expensas', 'luz', 'gas', 'agua', 'limpieza'], fits: ['hogar', 'suscripciones', 'otros'] },
]

const plain = (text: string) =>
  ` ${text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

/** True when the description clearly belongs to a kind of expense that the saved category does not fit. */
export function categorySeemsWrong(description: string, templateSlug: string | null): boolean {
  if (!templateSlug) return false
  const text = plain(description)
  const group = GROUPS.find((g) => g.words.some((w) => text.includes(` ${w}`)))
  return Boolean(group) && !group?.fits.includes(templateSlug)
}
