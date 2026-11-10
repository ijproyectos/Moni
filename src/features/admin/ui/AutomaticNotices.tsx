import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Toggle } from '@/shared/ui/kit'
import { adminApi } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatArDateTime } from '../domain/format'
import type { SettingKey } from '../domain/types'
import { DetailRow, ErrorBlock, LoadingBlock, PanelCard } from './widgets'

/** Switches of the two scheduled pushes (nightly reminder, Plus expiry) and the state of their cron. */
export function AutomaticNotices() {
  const queryClient = useQueryClient()
  const query = useAdminQuery(['avisos'], adminApi.avisos)
  const flip = useMutation({
    mutationFn: (args: { key: SettingKey; enabled: boolean }) => adminApi.setSetting(args),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'avisos'] }),
  })

  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock onRetry={() => void query.refetch()} />
  const state = query.data

  return (
    <PanelCard title="Avisos automáticos">
      {!state.cron_configured && (
        <p role="alert" className="rounded-2xl bg-gold p-3 text-[14px] font-semibold text-on-bright">
          Falta cargar el secreto del cron: hasta entonces los avisos automáticos no salen. Los
          pasos están en docs/PUSH.md.
        </p>
      )}
      <dl>
        <DetailRow label="Recordatorio nocturno (21:00): “Cargaste tus gastos de hoy”">
          <Toggle
            label="Recordatorio nocturno"
            checked={state.nightly_push_enabled}
            onChange={(enabled) => flip.mutate({ key: 'nightly_push_enabled', enabled })}
          />
        </DetailRow>
        <DetailRow label="Último recordatorio">
          {state.nightly_last_sent_at
            ? `${formatArDateTime(state.nightly_last_sent_at)} · ${state.nightly_last_sent_count ?? 0} enviados`
            : 'todavía no salió'}
        </DetailRow>
        <DetailRow label="Aviso de vencimiento de Plus (12:00)">
          <Toggle
            label="Aviso de vencimiento de Plus"
            checked={state.plus_expiry_push_enabled}
            onChange={(enabled) => flip.mutate({ key: 'plus_expiry_push_enabled', enabled })}
          />
        </DetailRow>
        <DetailRow label="Avisos de vencimiento (30 días)">{state.plus_notices_30d}</DetailRow>
      </dl>
      {flip.isError && (
        <p role="alert" className="text-[15px] font-semibold text-expense">
          No pudimos guardar el cambio. Probá de nuevo.
        </p>
      )}
      <p className="text-[13px] text-text-muted">
        Pausar un aviso lo frena desde la próxima ejecución; reanudarlo lo vuelve a activar. Queda
        registrado quién lo cambió.
      </p>
    </PanelCard>
  )
}
