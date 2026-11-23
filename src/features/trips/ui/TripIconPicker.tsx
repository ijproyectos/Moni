import { useState } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { cn } from '@/shared/ui/cn'
import { useToast } from '@/shared/ui/toastContext'
import { useSetTripIcon } from '../api/useTrips'
import { PICKABLE_THEMES, asTheme } from '../domain/destinationIcon'
import { DestinationGlyph } from './DestinationGlyph'

/** The round badge of a trip that opens the picker of its look. Only the icon is saved: destination, dates, budget and expenses stay. */
export function TripIconButton({ tripId, name, icon }: { tripId: string; name: string; icon?: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cambiar el ícono del viaje"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-tint-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
      >
        <DestinationGlyph name={name} icon={icon} size={28} />
      </button>
      {open && <TripIconPicker tripId={tripId} name={name} icon={icon} onClose={() => setOpen(false)} />}
    </>
  )
}

function TripIconPicker({ tripId, name, icon, onClose }: { tripId: string; name: string; icon?: string | null; onClose: () => void }) {
  const toast = useToast()
  const setIcon = useSetTripIcon()
  const chosen = asTheme(icon)

  async function pick(theme: string | null) {
    try {
      await setIcon.mutateAsync({ id: tripId, icon: theme })
      toast.show('Ícono guardado')
      onClose()
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  return (
    <BottomSheet title="Ícono del viaje" onClose={onClose}>
      <div role="group" aria-label="Íconos" className="grid grid-cols-4 gap-2">
        {PICKABLE_THEMES.map(({ theme, label }) => {
          const selected = chosen ? chosen === theme : false
          return (
            <button
              key={theme}
              type="button"
              disabled={setIcon.isPending}
              aria-pressed={selected}
              onClick={() => void pick(theme)}
              className={cn(
                'flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-[18px] border-2 px-1 text-[12.5px] font-bold',
                selected ? 'border-forest bg-tint-green' : 'border-line bg-card',
              )}
            >
              <DestinationGlyph name="" icon={theme} size={28} />
              {label}
            </button>
          )
        })}
      </div>
      {chosen && (
        <button
          type="button"
          disabled={setIcon.isPending}
          onClick={() => void pick(null)}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-line text-[15px] font-extrabold"
        >
          <DestinationGlyph name={name} icon={null} size={20} /> Volver al automático
        </button>
      )}
    </BottomSheet>
  )
}
