import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import type { GroupKind } from '@/shared/lib/database.types'
import { PHOTO_ACCEPT } from '@/shared/lib/imageOptimize'
import { cn } from '@/shared/ui/cn'
import { GroupKindTile } from './GroupKindIcon'

/** Choose, replace or remove the photo of a group. The icon of its kind stays when there is no photo. */
export function GroupPhotoPicker({
  kind,
  photoUrl,
  busy = false,
  onPick,
  onRemove,
  className,
}: {
  kind: GroupKind
  photoUrl: string | null
  busy?: boolean
  onPick: (file: File) => void
  onRemove: () => void
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const has = Boolean(photoUrl)
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <GroupKindTile kind={kind} photoUrl={photoUrl} className="size-20 rounded-[22px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-line bg-card px-4 text-[16px] font-extrabold text-ink disabled:opacity-60"
        >
          {has ? (
            <Camera aria-hidden="true" className="size-5 shrink-0" />
          ) : (
            <ImagePlus aria-hidden="true" className="size-5 shrink-0" />
          )}
          {busy ? 'Subiendo…' : has ? 'Cambiar foto' : 'Agregar foto'}
        </button>
        {has && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-extrabold text-expense disabled:opacity-60"
          >
            <Trash2 aria-hidden="true" className="size-4 shrink-0" /> Quitar foto
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        aria-label="Elegir foto del grupo"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Picking the same file again must still fire a change.
          event.target.value = ''
          if (file) onPick(file)
        }}
      />
    </div>
  )
}
