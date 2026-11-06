import {
  addButtonLabel,
  NAME_IN_GROUP,
  NAME_MISSING,
  NAME_REPEATED,
  nameKey,
  pendingCount,
  validateAll,
  validateDraft,
  type GuestDraft,
} from './guestDrafts'

const d = (id: string, name: string, over: Partial<GuestDraft> = {}): GuestDraft => ({
  id,
  name,
  alias: '',
  ...over,
})

describe('guest drafts', () => {
  it('compares names without case or extra spaces', () => {
    expect(nameKey('  Fran   Pérez ')).toBe(nameKey('fran pérez'))
  })

  it('needs a name; the alias is optional', () => {
    expect(validateDraft(d('1', '  '), [d('1', '  ')], [])).toBe(NAME_MISSING)
    expect(validateDraft(d('1', 'Fran', { alias: '' }), [d('1', 'Fran')], [])).toBeNull()
  })

  it('refuses a name that is already in the group, whatever its case', () => {
    expect(validateDraft(d('1', 'jonatan'), [d('1', 'jonatan')], ['Jonatan'])).toBe(NAME_IN_GROUP)
  })

  it('refuses the same person twice in the list, and flags both', () => {
    const list = [d('1', 'Fran'), d('2', ' fran ')]
    expect(validateAll(list, [])).toEqual({ '1': NAME_REPEATED, '2': NAME_REPEATED })
  })

  it('people already saved are skipped, but still count as taken names', () => {
    const list = [d('1', 'Fran', { saved: true }), d('2', 'Fran')]
    expect(validateAll(list, [])).toEqual({ '2': NAME_REPEATED })
    expect(validateAll([d('1', 'Fran', { saved: true })], [])).toEqual({})
  })

  it('counts only the people still to add', () => {
    expect(pendingCount([d('1', 'Fran'), d('2', ''), d('3', 'Lola', { saved: true })])).toBe(1)
  })

  it('words the main button by how many are to be added', () => {
    expect(addButtonLabel(0)).toBe('Agregar personas')
    expect(addButtonLabel(1)).toBe('Agregar 1 persona')
    expect(addButtonLabel(2)).toBe('Agregar 2 personas')
  })
})
