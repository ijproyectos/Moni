import { Banknote, CreditCard, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { monthNameOf } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ChoiceChip, MoniSays, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { percentLabel, type Goal } from '../domain/goals'
import { contribute, MOCK_SOURCES } from '../mock/goalsStore'

const SOURCE_ICONS = [CreditCard, WalletCards, Banknote]

// Screen 029 — Aportar a la meta. Saved as savings, not as an expense.
export function ContributeSheet({
  goal,
  suggestedCents,
  onClose,
}: {
  goal: Goal
  suggestedCents: number
  onClose: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState(formatAmountInput(suggestedCents))
  const [source, setSource] = useState<string>(MOCK_SOURCES[0] ?? '')
  const amount = parseAmountInput(text) ?? 0
  const after = goal.savedCents + amount
  const today = todayIso()

  function submit() {
    if (amount <= 0) return
    const month = monthNameOf(today)
    contribute(goal.id, amount, source, `Aporte de ${month}`, today)
    toast.show(`Aportaste ${formatArs(amount)}`)
    onClose()
  }

  return (
    <BottomSheet title="Aportar a la meta" subtitle={goal.name} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>¿Cuánto aportás?</SectionLabel>
        <AmountInput
          aria-label="Monto del aporte"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {MOCK_SOURCES.length > 0 && (
          <>
            <SectionLabel className="mt-1">¿De dónde sale?</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {MOCK_SOURCES.map((s, i) => (
                <ChoiceChip
                  key={s}
                  icon={SOURCE_ICONS[i]}
                  selected={source === s}
                  onClick={() => setSource(s)}
                >
                  {s}
                </ChoiceChip>
              ))}
            </div>
          </>
        )}
        {amount > 0 && (
          <MoniSays>
            con este aporte llegás a {formatArs(after)} (
            {percentLabel(Math.min(1, after / goal.targetCents))}). Lo guardo como ahorro, no como
            gasto.
          </MoniSays>
        )}
        <Button className="mt-1" onClick={submit} disabled={amount <= 0}>
          Aportar {amount > 0 ? formatArs(amount) : ''}
        </Button>
      </div>
    </BottomSheet>
  )
}
