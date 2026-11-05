import { Lock } from 'lucide-react'
import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { formatArs } from '@/shared/lib/money'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Page, ProgressBar } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useRewards } from '../api/useSavings'
import { collection, earnedCount, type CollectionItem } from '../domain/badges'
import { earnedOn } from '../domain/earnedOn'
import { BadgeImage } from './BadgeImage'

/** "Mis logros": every badge of the collection; the ones earned in color, the rest dimmed with how to unlock them. */
export function AchievementsPage() {
  const rewards = useRewards()
  const [open, setOpen] = useState<CollectionItem | null>(null)
  const earned = rewards.data?.badges ?? []
  const items = collection(earned)
  const total = items.length
  const count = earnedCount(earned)

  return (
    <Page native>
      <PageHeader title="Mis logros" fallbackTo="/perfil" />
      {rewards.isLoading ? (
        <div role="status" aria-label="Cargando logros" className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : rewards.isError ? (
        <EmptyState
          mascotUrl={mascotHappy}
          title="No pudimos cargar tus logros"
          description="Revisá tu conexión y probá de nuevo."
          action={<Button onClick={() => void rewards.refetch()}>Reintentar</Button>}
        />
      ) : (
        <>
          <section className="rounded-[28px] bg-forest p-5 text-cream">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
              Tu colección
            </p>
            <p className="font-display text-[34px] font-extrabold leading-[42px]">
              {count} de {total}
              <span className="ml-2 text-[16px] font-bold text-text-muted-on-dark">insignias</span>
            </p>
            <ProgressBar
              value={count / total}
              tone="dark"
              className="mt-2"
              label="Insignias conseguidas"
            />
            {count === 0 && (
              <p className="mt-2 text-[15px] text-text-muted-on-dark">
                Todavía no conseguiste ninguna. Cada meta que cumplas suma una.
              </p>
            )}
          </section>
          <ul className="grid grid-cols-3 gap-2.5">
            {items.map((item) => {
              const unlocked = item.earned !== null
              return (
                <li key={item.def.key}>
                  <button
                    type="button"
                    onClick={() => setOpen(item)}
                    aria-label={
                      unlocked
                        ? `${item.def.name}, conseguida`
                        : `${item.def.name}, bloqueada. ${item.def.hint}`
                    }
                    className={cn(
                      'flex h-full w-full flex-col items-center gap-1.5 rounded-[20px] border px-1.5 pb-2.5 pt-2',
                      unlocked
                        ? 'border-lime bg-card shadow-[0_0_16px_-4px_rgba(184,236,124,0.95)] dark:border-lime/70 dark:shadow-[0_0_18px_-4px_rgba(184,236,124,0.55)]'
                        : 'border-line bg-card',
                    )}
                  >
                    <span className="relative flex aspect-square w-full items-center justify-center">
                      <BadgeImage
                        badgeKey={item.def.key}
                        locked={!unlocked}
                        className={cn(
                          'size-[88%]',
                          unlocked && 'drop-shadow-[0_2px_6px_rgb(16_48_30/0.25)]',
                        )}
                      />
                      {!unlocked && (
                        <Lock
                          aria-hidden="true"
                          className="absolute bottom-0 right-0.5 size-5 rounded-full bg-sand p-1 text-text-muted"
                        />
                      )}
                    </span>
                    <span className="line-clamp-2 min-h-8 text-[13px] font-extrabold leading-4">
                      {item.def.name}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {open && <BadgeDetailSheet item={open} onClose={() => setOpen(null)} />}
    </Page>
  )
}

function BadgeDetailSheet({ item, onClose }: { item: CollectionItem; onClose: () => void }) {
  const { def, earned } = item
  return (
    <BottomSheet title={def.name} onClose={onClose}>
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <BadgeImage
          badgeKey={def.key}
          locked={!earned}
          className="size-40 motion-safe:animate-[badge-pop_500ms_ease-out]"
        />
        {earned ? (
          <>
            <p className="text-[18px] font-extrabold leading-6">{def.congrats}</p>
            <dl className="w-full divide-y divide-line rounded-[20px] border border-line bg-card px-4 text-left">
              {earned.goalName && (
                <div className="flex justify-between gap-3 py-2.5">
                  <dt className="text-text-muted">Meta</dt>
                  <dd className="font-extrabold">{earned.goalName}</dd>
                </div>
              )}
              {earned.targetCents !== null && (
                <div className="flex justify-between gap-3 py-2.5">
                  <dt className="text-text-muted">Objetivo alcanzado</dt>
                  <dd className="font-extrabold">{formatArs(earned.targetCents)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 py-2.5">
                <dt className="text-text-muted">Conseguida</dt>
                <dd className="font-extrabold">{earnedOn(earned.earnedAt)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <p className="text-[17px] font-extrabold leading-6">Todavía no la conseguiste</p>
            <p className="text-[16px] leading-6 text-text-muted">{def.hint}</p>
          </>
        )}
        <Button className="mt-2 w-full" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </BottomSheet>
  )
}
