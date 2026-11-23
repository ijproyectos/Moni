import { Settings } from 'lucide-react'
import { useState } from 'react'
import { AchievementsRow } from '@/features/goals/ui/AchievementsRow'
import { usePlus } from '@/features/plus/api/usePlus'
import { useUpdateGoals } from '@/features/onboarding/api/useGoals'
import {
  GOAL_OPTIONS,
  goalsForSelector,
  goalsToPersist,
  sanitizeGoals,
  toggleGoal,
} from '@/features/onboarding/domain/goals'
import { FEATURES } from '@/shared/config/features'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { CheckDot, MoniSays, Page, SectionLabel } from '@/shared/ui/kit'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'
import { SettingRow } from '@/shared/ui/SettingRow'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { Sparkles } from 'lucide-react'
import { updateProfileExtras, useProfileExtras } from '../mock/profileExtrasStore'
import { joinedLabel, useProfileIdentity } from './profileIdentity'

export function ProfileGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-card px-4">{children}</div>
  )
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 pt-2 text-[11.5px] font-bold uppercase tracking-[0.14em] text-text-muted">{children}</h2>
}

type Sheet = 'income' | 'goals' | null

/** Perfil: who you are, your financial health and the way into your data and the app's settings. */
export function ProfilePage() {
  const id = useProfileIdentity()
  const extras = useProfileExtras()
  const plus = usePlus()
  const [sheet, setSheet] = useState<Sheet>(null)
  const goalCount = sanitizeGoals(id.profile?.goals).length
  const since = joinedLabel(id.createdAt)

  return (
    <Page className="gap-3 pb-6 pt-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em]">Perfil</h1>
      </header>

      {id.isLoading ? (
        <Skeleton className="h-20" />
      ) : id.isError ? (
        <p role="alert" className="text-center text-expense">
          No pudimos cargar tu perfil.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <PhotoOrInitial
            url={id.photo}
            initial={id.initial}
            alt="Tu foto de perfil"
            className="size-[72px] shrink-0"
            fallbackClassName="bg-[#2B2A5C] font-display text-[28px] font-extrabold text-[#D9D4F5]"
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em]">{id.displayName}</h2>
            {id.email && <p className="truncate text-[14px] text-text-muted">{id.email}</p>}
            {plus.isPlus ? (
              <span className="mt-1.5 inline-block rounded-full border border-[#B88A1E] px-2.5 text-[11px] font-extrabold leading-5 tracking-[0.1em] text-[#B88A1E] dark:border-[#E3B23C] dark:text-[#E3B23C]">
                PLUS
              </span>
            ) : (
              <span className="mt-1.5 inline-block rounded-full border border-line px-2.5 text-[11px] font-extrabold leading-5 tracking-[0.1em] text-text-muted">
                GRATIS
              </span>
            )}
          </div>
        </div>
      )}

      <GroupLabel>Mis datos</GroupLabel>
      <ProfileGroup>
        <SettingRow
          title="Datos personales"
          subtitle={since ? `Nombre, mail y foto · desde ${since.replace(/ de /, ' ')}` : 'Nombre, mail y foto'}
          to="/perfil/datos"
        />
        {FEATURES.monthlyIncome && (
          <SettingRow
            title="Mis ingresos"
            subtitle={`${formatArs(extras.monthlyIncomeCents)} por mes · solo los ves vos`}
            onClick={() => setSheet('income')}
          />
        )}
        <SettingRow
          title="Mis objetivos"
          subtitle={
            goalCount === 0
              ? 'Sin elegir · ves todas las herramientas'
              : `${goalCount} ${goalCount === 1 ? 'elegido' : 'elegidos'} · arman tu app`
          }
          onClick={() => setSheet('goals')}
        />
        <AchievementsRow />
      </ProfileGroup>

      <ProfileGroup>
        <SettingRow
          icon={<Settings className="size-[18px]" strokeWidth={1.9} />}
          title="Configuración"
          subtitle="Tema, privacidad, plan y ayuda"
          to="/perfil/configuracion"
        />
      </ProfileGroup>

      {FEATURES.monthlyIncome && sheet === 'income' && (
        <IncomeSheet value={extras.monthlyIncomeCents} onClose={() => setSheet(null)} />
      )}
      {sheet === 'goals' && <GoalsSheet saved={id.profile?.goals ?? []} onClose={() => setSheet(null)} />}
    </Page>
  )
}

// Goals chosen in onboarding; they decide which sections the app puts up front.
function GoalsSheet({ saved, onClose }: { saved: readonly string[]; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdateGoals()
  const [draft, setDraft] = useState(() => goalsForSelector(saved))
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    try {
      await update.mutateAsync(goalsToPersist(draft))
      toast.show('Objetivos actualizados')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Mis objetivos" onClose={onClose}>
      <p className="-mt-1 mb-3 text-[15px] leading-5 text-text-muted">
        Según lo que elijas, Moni te muestra primero esas herramientas. Las demás siguen en Perfil ›
        Más herramientas.
      </p>
      <ul className="flex flex-col gap-2">
        {GOAL_OPTIONS.map((goal) => {
          const checked = draft.includes(goal.id)
          return (
            <li key={goal.id}>
              <button
                type="button"
                aria-pressed={checked}
                onClick={() => setDraft((d) => toggleGoal(d, goal.id))}
                className={
                  'flex min-h-14 w-full items-center gap-3 rounded-[18px] border-2 bg-card px-4 py-2 text-left text-[16px] font-semibold leading-5 text-ink ' +
                  (checked ? 'border-ink' : 'border-line')
                }
              >
                <span className="flex-1">{goal.label}</span>
                <CheckDot checked={checked} />
              </button>
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-expense">
          {error}
        </p>
      )}
      <Button className="mt-4" onClick={() => void save()} disabled={update.isPending}>
        {update.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </BottomSheet>
  )
}

// Perfil 003 — Mis ingresos (simulated, used by Metas and "según ingresos").
function IncomeSheet({ value, onClose }: { value: number; onClose: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(formatAmountInput(value))
  const amount = parseAmountInput(text) ?? 0
  return (
    <BottomSheet title="Mis ingresos" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>Cuánto ingresás por mes</SectionLabel>
        <AmountInput
          aria-label="Ingresos por mes"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <MoniSays
          lead={null}
          icon={<Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
        >
          Solo lo ves vos. Moni lo usa para sugerirte metas y para repartir “según ingresos”: en los
          grupos cada uno ve su porcentaje, nunca lo que gana el otro.
        </MoniSays>
        <p className="text-[15px] leading-5 text-text-muted">
          El aguinaldo y los ingresos extra los cargás aparte, cuando llegan.
        </p>
        <Button
          disabled={amount <= 0}
          onClick={() => {
            updateProfileExtras({ monthlyIncomeCents: amount })
            toast.show('Ingresos guardados')
            onClose()
          }}
        >
          Guardar
        </Button>
      </div>
    </BottomSheet>
  )
}
