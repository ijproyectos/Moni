import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { ChoiceChip } from '@/shared/ui/kit'
import { useCreateTripCategory, useTripCategories } from '../api/useTrips'
import { allTripCategories } from '../domain/tripCategories'
import { TripCategoryIcon } from './TripCategoryIcon'
import { tripFieldClass } from './TripFormParts'

/** The nine predefined categories with their icons, the person's own ones, and a way to add one more. Nothing here is required. */
export function TripCategoryPicker({ value, onChange }: { value: string | null; onChange: (key: string) => void }) {
  const custom = useTripCategories()
  const create = useCreateTripCategory()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const categories = allTripCategories(custom.data ?? [])

  async function add() {
    setError(null)
    if (!name.trim()) return
    try {
      const created = await create.mutateAsync({ name })
      onChange(created.id)
      setName('')
      setAdding(false)
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Categoría del gasto" className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <ChoiceChip key={c.key} selected={value === c.key} onClick={() => onChange(c.key)} className="min-h-10 gap-1.5 px-3 text-[14px]">
            <TripCategoryIcon icon={c.icon} className="size-4" />
            {c.label}
          </ChoiceChip>
        ))}
        {!adding && (
          <ChoiceChip onClick={() => setAdding(true)} className="min-h-10 gap-1.5 px-3 text-[14px]" aria-label="Agregar categoría">
            <Plus aria-hidden="true" className="size-4" /> Otra
          </ChoiceChip>
        )}
      </div>
      {adding && (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nombre de la categoría"
            maxLength={30}
            placeholder="Ej: Souvenirs"
            className={`${tripFieldClass} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={create.isPending}
            className="min-h-14 rounded-[18px] bg-forest px-4 text-[15px] font-extrabold text-cream disabled:opacity-60 dark:bg-lime dark:text-on-bright"
          >
            Agregar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
    </div>
  )
}
