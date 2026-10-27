import { Heart, House, KeyRound } from 'lucide-react'
import { useState } from 'react'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ChoiceChip, IconTile, MoniCalcCard, OptionRow, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { addMonths, roundUpSuggestion, splitMonthly, type SplitMode } from '../domain/goals'
import { addGoal, MOCK_SPACES, newInviteCode } from '../mock/goalsStore'
import { GoalInviteSheet } from './GoalInviteSheet'
import { SplitPanel } from './SplitPanel'

const PARTNER_BY_SPACE: Record<string, string> = { Nosotros: 'Caro', 'Depto Palermo': 'Fran' }
const INCOME_SHARE = 0.6

// Screens 046 / 135 — Meta compartida (create from the Compartidas tab).
export function SharedGoalSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const toast = useToast()
  const today = todayIso()
  const [space, setSpace] = useState<string>(MOCK_SPACES[0]?.name ?? 'Nosotros')
  const [name, setName] = useState('')
  const [amountText, setAmountText] = useState('')
  const [months, setMonths] = useState<6 | 12 | 24>(12)
  const [split, setSplit] = useState<SplitMode>('income')
  const [inviting, setInviting] = useState(false)
  const [code] = useState(() => newInviteCode('Fondo'))
  const [error, setError] = useState<string | null>(null)

  const partner = PARTNER_BY_SPACE[space] ?? 'Caro'
  const amount = parseAmountInput(amountText) ?? 0
  const monthly = roundUpSuggestion(amount / months)
  const [mine, theirs] = splitMonthly(monthly, split, INCOME_SHARE)

  function create() {
    if (!name.trim()) return setError('Ponele un nombre a la meta.')
    if (amount <= 0) return setError('Decinos cuánto necesitan.')
    addGoal({
      name: name.trim(),
      targetCents: amount,
      dueDate: addMonths(today, months),
      icon: space === 'Nosotros' ? 'heart' : 'house',
      shared: {
        space,
        partner,
        split,
        incomeShare: INCOME_SHARE,
        mineCents: 0,
        theirsCents: 0,
        monthMineCents: 0,
        monthTheirsCents: 0,
        inviteCode: code,
        pending: true,
      },
    })
    toast.show('Meta compartida creada')
    onCreated()
  }

  if (inviting) {
    return (
      <GoalInviteSheet
        partner={partner}
        code={code}
        goalName={name || 'la meta'}
        moment="after"
        onClose={() => setInviting(false)}
        onDone={() => setInviting(false)}
      />
    )
  }

  return (
    <BottomSheet title="Meta compartida" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>¿En qué espacio?</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {MOCK_SPACES.map((s) => (
            <ChoiceChip
              key={s.name}
              icon={s.kind === 'couple' ? Heart : House}
              selected={space === s.name}
              onClick={() => setSpace(s.name)}
            >
              {s.name}
            </ChoiceChip>
          ))}
        </div>
        <SectionLabel className="mt-1">Nombre</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Fondo para el depto"
          aria-label="Nombre"
          maxLength={40}
          className="h-14 rounded-[18px] border border-sand bg-white px-4 text-[17px] placeholder:text-text-muted"
        />
        <SectionLabel className="mt-1">¿Cuánto necesitan?</SectionLabel>
        <AmountInput
          aria-label="Monto"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />
        <SectionLabel className="mt-1">¿Para cuándo?</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {([6, 12, 24] as const).map((m) => (
            <ChoiceChip key={m} selected={months === m} onClick={() => setMonths(m)}>
              {m === 6 ? '6 meses' : m === 12 ? '1 año' : '2 años'}
            </ChoiceChip>
          ))}
        </div>
        <MoniCalcCard title={`${formatArs(monthly)} por mes`} mascot={mascotGroup}>
          Vos {formatArs(mine)} · {partner} {formatArs(theirs)}
        </MoniCalcCard>
        <SplitPanel
          mode={split}
          onModeChange={setSplit}
          partner={partner}
          mineCents={mine}
          theirsCents={theirs}
          incomeShare={INCOME_SHARE}
          showNote={false}
        />
        <OptionRow
          icon={<IconTile icon={KeyRound} bg="#d9ebe4" />}
          title={`Invitá a ${partner} con un código`}
          subtitle="Así ve la meta y aporta desde su app"
          onClick={() => setInviting(true)}
        />
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button className="mt-1" onClick={create}>
          Crear meta compartida
        </Button>
      </div>
    </BottomSheet>
  )
}
