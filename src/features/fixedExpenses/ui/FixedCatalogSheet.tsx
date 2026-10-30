import { Plus } from 'lucide-react'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { DashedButton } from '@/shared/ui/kit'
import { FIXED_KINDS, type FixedKind } from '../domain/catalog'
import { KindTile } from './KindTile'

/** Picks the kind of fixed expense (icons, no company logos) or asks for a custom one. */
export function FixedCatalogSheet({
  onPick,
  onCustom,
  onClose,
}: {
  onPick: (kind: FixedKind) => void
  onCustom: () => void
  onClose: () => void
}) {
  return (
    <BottomSheet title="Nuevo gasto fijo" subtitle="¿Cuál es?" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <ul className="grid grid-cols-3 gap-2">
          {FIXED_KINDS.map((kind) => (
            <li key={kind.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onPick(kind)}
                className="flex h-full min-h-[104px] w-full flex-col items-center justify-start gap-2 rounded-[18px] border border-sand bg-card px-1.5 py-3 text-center"
              >
                <KindTile kindId={kind.id} size="md" className="border-0" />
                <span className="line-clamp-2 w-full break-words text-[14px] font-extrabold leading-[18px] text-ink">
                  {kind.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <DashedButton onClick={onCustom}>
          <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
          Agregar otro gasto fijo
        </DashedButton>
      </div>
    </BottomSheet>
  )
}
