import { Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { ChoiceChip } from '@/shared/ui/kit'
import { useGroupPhotos } from '../api/useGroupPhotos'
import type { MyGroup } from '../domain/group'
import { GroupRowIcon } from './GroupsScreen'

const PREVIEW = 3
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface PickableGroup extends Pick<MyGroup, 'id' | 'name' | 'kind' | 'memberCount'> {
  /** Signed link to the group's photo, when it has one. */
  photoUrl?: string | null
}

/**
 * Picks ONE group: the first three (the caller sends them most recent first) and, when there are more, «Ver más grupos» with every one and a
 * search by name. Same shape as «Personas de Moni». The caller decides which groups are on offer (see `selectableGroups`); with none, the
 * `empty` text invites to create one.
 */
export function GroupPicker({
  groups,
  selectedId,
  onSelect,
  empty,
  label = 'Tus grupos',
}: {
  groups: readonly PickableGroup[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Shown when there is no group to pick. */
  empty: ReactNode
  label?: string
}) {
  const photos = useGroupPhotos()
  const [all, setAll] = useState(false)
  const [query, setQuery] = useState('')
  const withPhoto = useMemo(() => groups.map((g) => ({ ...g, photoUrl: g.photoUrl ?? photos[g.id]?.url ?? null })), [groups, photos])
  // The chosen one stays in sight even when it is beyond the first three.
  const selected = withPhoto.find((g) => g.id === selectedId)
  const preview = withPhoto.slice(0, PREVIEW)
  const shown = selected && !preview.some((g) => g.id === selected.id) ? [selected, ...preview.slice(0, PREVIEW - 1)] : preview
  const filtered = withPhoto.filter((g) => normalize(g.name).includes(normalize(query.trim())))

  if (withPhoto.length === 0) {
    return <p className="rounded-[20px] bg-card px-4 py-3 text-[14px] leading-5 text-text-muted">{empty}</p>
  }

  function row(g: (typeof withPhoto)[number], onPick: () => void) {
    return (
      <ChoiceChip key={g.id} selected={selectedId === g.id} onClick={onPick} className="min-h-14 justify-start gap-3 px-3">
        <GroupRowIcon group={g} />
        <span className="min-w-0 flex-1 truncate text-left">{g.name}</span>
        <span className="shrink-0 text-[13px] font-bold opacity-70">
          {g.memberCount} {g.memberCount === 1 ? 'persona' : 'personas'}
        </span>
      </ChoiceChip>
    )
  }

  return (
    <>
      <div role="group" aria-label={label} className="flex flex-col gap-2">
        {shown.map((g) => row(g, () => onSelect(g.id)))}
      </div>
      {withPhoto.length > PREVIEW && (
        <button type="button" onClick={() => setAll(true)} className="mx-auto flex min-h-11 items-center px-3 text-[14px] font-extrabold text-text-muted">
          Ver más grupos
        </button>
      )}
      {all && (
        <BottomSheet title={label} onClose={() => setAll(false)}>
          <label className="mb-2 flex h-12 items-center gap-2 rounded-full border border-line bg-card px-4">
            <Search aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar entre tus grupos"
              placeholder="Buscar por nombre"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-placeholder"
            />
          </label>
          {filtered.length === 0 ? (
            <p className="py-3 text-center text-[14px] text-text-muted">Ningún grupo con ese nombre.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((g) =>
                row(g, () => {
                  onSelect(g.id)
                  setAll(false)
                }),
              )}
            </div>
          )}
        </BottomSheet>
      )}
    </>
  )
}
