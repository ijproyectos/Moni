/** The people being added by name in one go: what is typed, what was saved and what failed. */
export interface GuestDraft {
  id: string
  name: string
  alias: string
  /** Stored already: a retry skips it, so nobody is added twice. */
  saved?: boolean
  /** Why it could not be added (shown next to this person). */
  error?: string | null
}

export const NAME_MISSING = 'Escribí un nombre.'
export const NAME_IN_GROUP = 'Ya hay alguien con ese nombre en el grupo.'
export const NAME_REPEATED = 'Ya cargaste a esta persona.'

/** Names are compared without case or extra spaces, like the server does. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

/** The problem with one draft, or null when it can be added. */
export function validateDraft(
  draft: GuestDraft,
  all: readonly GuestDraft[],
  existingNames: readonly string[],
): string | null {
  const key = nameKey(draft.name)
  if (!key) return NAME_MISSING
  if (existingNames.some((n) => nameKey(n) === key)) return NAME_IN_GROUP
  if (all.some((other) => other.id !== draft.id && nameKey(other.name) === key))
    return NAME_REPEATED
  return null
}

/** Problems of every draft that is still to be saved, by draft id. */
export function validateAll(
  drafts: readonly GuestDraft[],
  existingNames: readonly string[],
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const draft of drafts) {
    if (draft.saved) continue
    const problem = validateDraft(draft, drafts, existingNames)
    if (problem) errors[draft.id] = problem
  }
  return errors
}

/** How many people the main button will add. */
export function pendingCount(drafts: readonly GuestDraft[]): number {
  return drafts.filter((d) => !d.saved && nameKey(d.name)).length
}

/** "Agregar 1 persona", "Agregar 2 personas"; without anyone yet, just "Agregar personas". */
export function addButtonLabel(count: number): string {
  if (count <= 0) return 'Agregar personas'
  return `Agregar ${count} ${count === 1 ? 'persona' : 'personas'}`
}
