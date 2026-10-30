import { ChevronLeft, ChevronRight, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { GroupKind } from '@/shared/lib/database.types'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { MoniSays, SectionLabel, SplitBar } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import type { Person } from '../domain/ledger'
import { FEATURES } from '@/shared/config/features'
import { DEFAULT_RECURRING, patchOverlay, type GroupOverlay } from '../mock/overlayStore'
import { RecurringList } from './CreateGroupPage'
import { AvatarStack } from './groupVisuals'
import { fieldClass } from './styles'

interface EditGroupSheetProps {
  groupId: string
  kind: GroupKind
  name: string
  people: readonly Person[]
  overlay: GroupOverlay
  onClose: () => void
  onLeave: () => void
  onRemove: () => void
}

// Screens 106 / 109 / 113 / 116 / 130 — Editar grupo. Changes here live in the in-memory overlay.
export function EditGroupSheet({
  groupId,
  kind,
  name,
  people,
  overlay,
  onClose,
  onLeave,
  onRemove,
}: EditGroupSheetProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [draft, setDraft] = useState(name)
  const [split, setSplit] = useState(overlay.coupleSplit)
  const [recurring, setRecurring] = useState(
    overlay.recurring.length ? overlay.recurring : DEFAULT_RECURRING,
  )
  const partner = people.find((p) => !p.isMe)
  const others = people.filter((p) => !p.isMe)
  const guests = others.filter((p) => !p.hasMoni)

  function save() {
    patchOverlay(groupId, {
      name: draft.trim() && draft.trim() !== name ? draft.trim() : overlay.name,
      coupleSplit: split,
      recurring: kind === 'casa' ? recurring : overlay.recurring,
    })
    toast.show('Cambios guardados')
    onClose()
  }

  return (
    <BottomSheet title="Editar grupo" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <MoniSays
          lead={null}
          icon={<Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
        >
          Todos los del grupo pueden editar. Moni avisa cada cambio.
        </MoniSays>
        <SectionLabel>Nombre</SectionLabel>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Nombre del grupo"
          maxLength={60}
          className={fieldClass}
        />

        {kind === 'casa' && recurring.length > 0 && (
          <>
            <SectionLabel>Gastos que se repiten cada mes</SectionLabel>
            <RecurringList items={recurring} onChange={setRecurring} />
          </>
        )}
        {kind === 'pareja' && FEATURES.groupGuestsAndSimulatedSplits && (
          <>
            <SectionLabel>¿Cómo dividen?</SectionLabel>
            <SegmentedControl
              label="Cómo dividen"
              value={split}
              onChange={setSplit}
              options={[
                { value: 'half', label: '50/50' },
                { value: 'income', label: 'Según ingresos' },
              ]}
            />
            {split === 'income' && (
              <div className="rounded-[20px] border border-sand bg-white p-4">
                <div className="flex justify-between text-[17px] font-extrabold">
                  <span>Vos {Math.round(overlay.incomeShare * 100)} %</span>
                  <span>
                    {partner?.name ?? 'Tu pareja'} {100 - Math.round(overlay.incomeShare * 100)} %
                  </span>
                </div>
                <SplitBar share={overlay.incomeShare} rest="blush" className="mt-2" />
                <p className="mt-2 text-[14px] leading-5 text-text-muted">
                  Los gastos nuevos se dividen así. Los que ya cargaron no cambian.
                </p>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => navigate(`/grupos/${groupId}/personas`)}
          className="flex items-center gap-3 rounded-[22px] border border-sand bg-white px-4 py-3 text-left"
        >
          <AvatarStack people={people} size="md" />
          <span className="flex-1">
            <span className="block text-[18px] font-extrabold">Personas</span>
            <span className="block text-[14px] text-text-muted">
              {others.length === 0
                ? 'Solo vos por ahora'
                : `${others.map((o) => o.name).join(' y ')}${guests.length ? ` · ${guests.map((g) => g.name).join(' y ')} sin Moni` : ''}`}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onLeave}
            className="flex min-h-12 items-center justify-center gap-1 rounded-full border-2 border-sand bg-white text-[16px] font-extrabold"
          >
            <ChevronLeft aria-hidden="true" className="size-5" /> Salir del grupo
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex min-h-12 items-center justify-center gap-1 rounded-full border-2 border-sand bg-white text-[16px] font-extrabold text-expense"
          >
            <Trash2 aria-hidden="true" className="size-5" /> Eliminar grupo
          </button>
        </div>
        <Button onClick={save}>Guardar cambios</Button>
      </div>
    </BottomSheet>
  )
}
