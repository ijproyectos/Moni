import { Camera, ChevronRight, Mic, Pencil, Users, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useCategories } from '@/features/categories/api/useCategories'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { useTransactions } from '../api/useTransactions'
import { recentRepeats, type RepeatSuggestion } from '../domain/recentRepeats'

/** How far back the "Repetir uno reciente" suggestions look. */
const REPEAT_LOOKBACK_DAYS = 90

function daysAgoIso(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return todayIso(date)
}

interface QuickAddSheetProps {
  /** Photo and voice need a connection: offline they are disabled and the sheet says why. */
  online: boolean
  /** Free plan: photo and voice carry a "Plus" tag (their tap opens the upsell). */
  plusBadge: boolean
  onPhoto: () => void
  onVoice: () => void
  onManual: () => void
  onRepeat: (suggestion: RepeatSuggestion) => void
  onShare: () => void
  onClose: () => void
}

interface Way {
  id: 'photo' | 'voice' | 'manual'
  title: string
  hint: string
  icon: LucideIcon
  tone: string
  disabled: boolean
  badge: boolean
  onSelect: () => void
}

/**
 * Screen 18: the assistant's sheet. Three ways to load a movement (photo of the ticket, voice, by hand), the recent
 * expenses of the person to repeat in one tap, and the shortcut to split an expense with a group.
 */
export function QuickAddSheet({
  online,
  plusBadge,
  onPhoto,
  onVoice,
  onManual,
  onRepeat,
  onShare,
  onClose,
}: QuickAddSheetProps) {
  const transactions = useTransactions({ kind: 'expense', from: daysAgoIso(REPEAT_LOOKBACK_DAYS) })
  const categories = useCategories()
  const suggestions = useMemo(
    () =>
      recentRepeats(
        transactions.data ?? [],
        new Map((categories.data ?? []).map((c) => [c.id, c.name])),
      ),
    [transactions.data, categories.data],
  )

  const ways: Way[] = [
    {
      id: 'photo',
      title: 'Foto',
      hint: 'del ticket',
      icon: Camera,
      tone: 'bg-tint-blue text-[#285A86] dark:text-ink',
      disabled: !online,
      badge: plusBadge,
      onSelect: onPhoto,
    },
    {
      id: 'voice',
      title: 'Voz',
      hint: 'hablale a Moni',
      icon: Mic,
      tone: 'bg-lilac text-lilac-ink',
      disabled: !online,
      badge: plusBadge,
      onSelect: onVoice,
    },
    {
      id: 'manual',
      title: 'A mano',
      hint: 'con teclado',
      icon: Pencil,
      tone: 'bg-tint-gold text-warn-ink',
      // Stays enabled offline: the form shows its own notice and blocks saving.
      disabled: false,
      badge: false,
      onSelect: onManual,
    },
  ]

  return (
    <BottomSheet
      title="¿Cómo lo cargás?"
      subtitle="Contame y yo lo ordeno"
      variant="menta"
      icon={<img src={mascotHappy} alt="" className="size-11 shrink-0 rounded-full bg-lilac" />}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-3 gap-2.5">
          {ways.map((way) => (
            <button
              key={way.id}
              type="button"
              disabled={way.disabled}
              onClick={way.onSelect}
              className={cn(
                'relative flex flex-col items-center gap-2 rounded-3xl px-2.5 py-4 disabled:opacity-60',
                'motion-safe:transition active:brightness-95',
                FOCUS_RING,
                way.tone,
              )}
            >
              <span className="flex size-[52px] items-center justify-center rounded-full bg-card">
                <way.icon aria-hidden="true" className="size-6" strokeWidth={2.2} />
              </span>
              <span className="text-[15px] font-bold">{way.title}</span>
              <span className="-mt-1.5 text-[11.5px]">{way.hint}</span>
              {way.badge && (
                <span className="absolute right-2 top-2 rounded-full bg-sun px-1.5 text-[10px] font-bold leading-4 text-mint-ink">
                  Plus
                </span>
              )}
            </button>
          ))}
        </div>
        {!online && (
          <p role="status" className="-mt-1 text-center text-[13px] font-semibold text-text-muted">
            {OFFLINE_MESSAGE}
          </p>
        )}

        {suggestions.length > 0 && (
          <section aria-label="Repetir uno reciente" className="flex flex-col gap-2">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Repetir uno reciente
            </h3>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.key}
                  type="button"
                  onClick={() => onRepeat(suggestion)}
                  className={cn(
                    'rounded-full bg-card px-3.5 py-2 text-[13.5px] font-semibold text-ink',
                    'motion-safe:transition active:brightness-95',
                    FOCUS_RING,
                  )}
                >
                  {suggestion.label} <AmountDisplay cents={suggestion.amountCents} />
                </button>
              ))}
            </div>
          </section>
        )}

        <button
          type="button"
          onClick={onShare}
          className={cn(
            'flex items-center gap-2.5 rounded-[20px] bg-card px-3.5 py-3 text-left',
            'motion-safe:transition active:brightness-95',
            FOCUS_RING,
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-tint-gold text-warn-ink"
          >
            <Users className="size-4" strokeWidth={2} />
          </span>
          <span className="flex-1 text-[14px] font-semibold">Dividir un gasto con un grupo</span>
          <ChevronRight aria-hidden="true" className="size-[18px] text-[#8A9A90]" strokeWidth={2} />
        </button>
      </div>
    </BottomSheet>
  )
}
