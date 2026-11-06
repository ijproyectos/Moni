import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { SectionLabel } from '@/shared/ui/kit'
import {
  addButtonLabel,
  nameKey,
  pendingCount,
  validateAll,
  validateDraft,
  type GuestDraft,
} from '../domain/guestDrafts'
import { fieldClass } from './styles'

/** What the owner of the sheet answers for one person: `true` when stored, otherwise the reason it was not. */
export type AddGuestResult = true | string

interface GuestsFormSheetProps {
  /** Stores one person. Resolves `true`, or a message for the person it could not add. */
  onSubmit: (name: string, alias: string) => Promise<AddGuestResult> | AddGuestResult
  /** Names that already belong to the group (they cannot be added again). */
  existingNames?: readonly string[]
  /** Called once per save with the people that were stored (also when only some could be). */
  onAdded?: (names: string[]) => void
  /** Cancel or X. */
  onClose: () => void
  /** Everybody was added; defaults to `onClose`. */
  onDone?: () => void
  /** One person only (the partner of a couple): no "Agregar otra persona". */
  single?: boolean
  title?: string
}

let counter = 0
const blank = (): GuestDraft => ({ id: `g${++counter}`, name: '', alias: '' })
const isEmpty = (d: GuestDraft) => !nameKey(d.name) && !d.alias.trim()

// Screens 081 / 085 / 095 / 098 / 101 — Agregar personas sin Moni, de a varias.
export function GuestsFormSheet({
  onSubmit,
  existingNames = [],
  onAdded,
  onClose,
  onDone,
  single = false,
  title = 'Agregar personas',
}: GuestsFormSheetProps) {
  const [drafts, setDrafts] = useState<GuestDraft[]>(() => [blank()])
  const [openId, setOpenId] = useState<string>(() => drafts[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  // A second tap while a save is running must not send anybody twice.
  const busy = useRef(false)
  const focusName = useRef(false)

  const patch = (id: string, change: Partial<GuestDraft>) =>
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...change } : d)))

  const current = drafts.find((d) => d.id === openId)
  const problemOfCurrent =
    current && !current.saved ? validateDraft(current, drafts, existingNames) : null

  function openPerson(id: string) {
    if (current && !current.saved) {
      if (isEmpty(current) && drafts.length > 1) {
        setDrafts((list) => list.filter((d) => d.id !== current.id))
      } else if (problemOfCurrent) {
        patch(current.id, { error: problemOfCurrent })
        return
      }
    }
    focusName.current = true
    setOpenId(id)
  }

  function addAnother() {
    if (problemOfCurrent && current) {
      patch(current.id, { error: problemOfCurrent })
      return
    }
    const fresh = blank()
    focusName.current = true
    setDrafts((list) => [...list, fresh])
    setOpenId(fresh.id)
  }

  function remove(id: string) {
    const rest = drafts.filter((d) => d.id !== id)
    const kept = rest.length ? rest : [blank()]
    setDrafts(kept)
    if (id === openId) setOpenId((kept.find((d) => !d.saved) ?? kept[0])?.id ?? '')
  }

  async function save() {
    if (busy.current) return
    const errors = validateAll(drafts, existingNames)
    const firstBad = drafts.find((d) => errors[d.id])
    if (firstBad) {
      setDrafts((list) => list.map((d) => ({ ...d, error: errors[d.id] ?? null })))
      focusName.current = true
      setOpenId(firstBad.id)
      setSummary(null)
      return
    }
    busy.current = true
    setSaving(true)
    setSummary(null)
    const stored: string[] = []
    let failed = 0
    let next = drafts
    for (const draft of drafts) {
      if (draft.saved || isEmpty(draft)) continue
      const name = draft.name.trim()
      const result = await Promise.resolve(onSubmit(name, draft.alias.trim())).catch(
        (): AddGuestResult => 'No pudimos agregarla. Probá de nuevo.',
      )
      if (result === true) {
        stored.push(name)
        next = next.map((d) => (d.id === draft.id ? { ...d, saved: true, error: null } : d))
      } else {
        failed += 1
        next = next.map((d) => (d.id === draft.id ? { ...d, error: result } : d))
      }
      setDrafts(next)
    }
    busy.current = false
    setSaving(false)
    if (stored.length > 0) onAdded?.(stored)
    if (failed === 0) {
      ;(onDone ?? onClose)()
      return
    }
    const bad = next.find((d) => !d.saved && d.error)
    if (bad) setOpenId(bad.id)
    setSummary(
      stored.length > 0
        ? `Se agregaron ${stored.length}, pero ${failed === 1 ? 'una no se pudo' : `${failed} no se pudieron`} agregar. Revisá ${failed === 1 ? 'esa persona' : 'esas personas'} y volvé a intentar.`
        : `${failed === 1 ? 'No se pudo agregar a la persona' : 'No se pudo agregar a las personas'}. Revisá los datos y volvé a intentar.`,
    )
  }

  const count = pendingCount(drafts)
  const savedCount = drafts.filter((d) => d.saved).length

  return (
    <BottomSheet title={single ? 'Agregar a tu pareja' : title} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        noValidate
      >
        {summary && (
          <p role="alert" className="rounded-[16px] bg-tint-red px-4 py-3 text-[15px] leading-5">
            {summary}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {drafts.map((draft) => {
            const label = draft.name.trim() || 'Sin nombre'
            if (draft.saved) {
              return (
                <li
                  key={draft.id}
                  className="flex min-h-12 items-center gap-3 rounded-[18px] bg-tint-green px-4 py-2"
                >
                  <Check aria-hidden="true" className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 text-[16px] font-extrabold">{label}</span>
                  <span className="text-[14px] text-text-muted">Agregada</span>
                </li>
              )
            }
            if (draft.id !== openId) {
              return (
                <li
                  key={draft.id}
                  className={cn(
                    'rounded-[18px] border bg-card px-4 py-1',
                    draft.error ? 'border-expense' : 'border-line',
                  )}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openPerson(draft.id)}
                      aria-label={`Editar a ${label}`}
                      className="flex min-h-12 min-w-0 flex-1 flex-col justify-center py-1 text-left"
                    >
                      <span className="block text-[16px] font-extrabold leading-5">{label}</span>
                      {draft.alias.trim() && (
                        <span className="block text-[14px] leading-5 text-text-muted">
                          {draft.alias.trim()}
                        </span>
                      )}
                    </button>
                    <Pencil aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
                    <button
                      type="button"
                      onClick={() => remove(draft.id)}
                      aria-label={`Quitar a ${label}`}
                      className="flex size-11 shrink-0 items-center justify-center text-text-muted"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  {draft.error && (
                    <p role="alert" className="pb-2 text-[14px] leading-5 text-expense">
                      {draft.error}
                    </p>
                  )}
                </li>
              )
            }
            return (
              <li key={draft.id} className="rounded-[20px] border border-line bg-card p-3">
                <div className="flex flex-col gap-2">
                  <SectionLabel>Nombre</SectionLabel>
                  <input
                    value={draft.name}
                    onChange={(e) => patch(draft.id, { name: e.target.value, error: null })}
                    aria-label="Nombre"
                    aria-invalid={Boolean(draft.error)}
                    maxLength={40}
                    placeholder="Ej: Fran"
                    className={cn(fieldClass, 'scroll-mb-28', draft.error && 'border-expense')}
                    data-autofocus
                    autoFocus={focusName.current}
                  />
                  {draft.error && (
                    <p role="alert" className="text-[14px] leading-5 text-expense">
                      {draft.error}
                    </p>
                  )}
                  <SectionLabel>
                    Alias para cobrar{' '}
                    <span className="font-bold normal-case tracking-normal">· opcional</span>
                  </SectionLabel>
                  <input
                    value={draft.alias}
                    onChange={(e) => patch(draft.id, { alias: e.target.value })}
                    aria-label="Alias para cobrar"
                    maxLength={40}
                    placeholder="Ej: fran.mp"
                    className={cn(fieldClass, 'scroll-mb-28')}
                  />
                  {drafts.filter((d) => !d.saved).length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(draft.id)}
                      className="mt-1 flex min-h-11 items-center gap-2 self-start text-[15px] font-bold text-text-muted"
                    >
                      <Trash2 aria-hidden="true" className="size-4" /> Quitar a esta persona
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {!single && (
          <button
            type="button"
            onClick={addAnother}
            disabled={saving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-line text-[16px] font-extrabold text-ink disabled:opacity-60"
          >
            <Plus aria-hidden="true" className="size-5" /> Agregar otra persona
          </button>
        )}

        <p className="text-[14px] leading-5 text-text-muted">
          Sin cuenta: entran en gastos y deudas, pero no ven el grupo ni reciben avisos. Si después
          se hacen una cuenta de Moni, las vinculás y se quedan con todo lo cargado.
        </p>

        {/* Stays in view while the list scrolls; it reaches down over the sheet's own bottom padding so nothing peeks under it.
            On a short screen (the keyboard is up) it scrolls with the form instead of covering the field being typed in. */}
        <div className="sticky bottom-[calc(max(env(safe-area-inset-bottom),20px)*-1)] bg-canvas [@media(max-height:480px)]:static pb-[max(env(safe-area-inset-bottom),20px)] pt-2">
          <Button type="submit" disabled={saving || (count === 0 && savedCount === 0)}>
            {saving
              ? 'Agregando…'
              : count === 0 && savedCount > 0
                ? 'Listo'
                : addButtonLabel(count)}
          </Button>
        </div>
      </form>
    </BottomSheet>
  )
}
