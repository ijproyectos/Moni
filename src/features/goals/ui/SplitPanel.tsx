import { formatArs } from '@/shared/lib/money'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { SplitBar } from '@/shared/ui/kit'
import type { SplitMode } from '../domain/goals'

interface SplitPanelProps {
  mode: SplitMode
  onModeChange: (mode: SplitMode) => void
  partner: string
  mineCents: number
  theirsCents: number
  incomeShare: number
  /** Explanation under the bar; hidden in compact forms. */
  showNote?: boolean
}

/** "Según ingresos / Mitad y mitad" selector plus the split card (027, 045, 046, 134-136). */
export function SplitPanel({
  mode,
  onModeChange,
  partner,
  mineCents,
  theirsCents,
  incomeShare,
  showNote = true,
}: SplitPanelProps) {
  const share = mode === 'half' ? 0.5 : incomeShare
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label="Cómo dividen"
        value={mode}
        onChange={onModeChange}
        options={[
          { value: 'income', label: 'Según ingresos' },
          { value: 'half', label: 'Mitad y mitad' },
        ]}
      />
      <div className="rounded-[20px] border border-sand bg-white p-4">
        <p className="text-[17px] font-extrabold">
          {mode === 'half' ? 'Cada uno aporta lo mismo' : 'Cada uno aporta según lo que gana'}
        </p>
        <SplitBar share={share} className="mt-3" />
        <div className="mt-2 flex justify-between text-[15px]">
          <span>
            <strong className="font-extrabold">Vos</strong> {pct(share)} · {formatArs(mineCents)}
          </span>
          <span>
            <strong className="font-extrabold">{partner}</strong> {pct(1 - share)} ·{' '}
            {formatArs(theirsCents)}
          </span>
        </div>
        {showNote && (
          <p className="mt-2 text-[15px] leading-5 text-text-muted">
            {mode === 'half'
              ? 'Mitad para cada uno, sin importar cuánto gana.'
              : 'Moni usa los ingresos de los dos. Cada uno ve solo su porcentaje.'}
          </p>
        )}
      </div>
    </div>
  )
}
