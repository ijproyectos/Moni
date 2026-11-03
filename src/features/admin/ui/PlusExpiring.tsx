import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { adminApi } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatArDate } from '../domain/format'
import { daysLeftLabel, describeNotifyError } from '../domain/messages'
import { adminPath } from '../domain/paths'
import type { PlusExpiringRow, PushResult } from '../domain/types'
import { Chip, ErrorBlock, LoadingBlock, PanelCard, TABLE, TD, TH, TR, TableWrap } from './widgets'

function NotifyButton({ row }: { row: PlusExpiringRow }) {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<PushResult | null>(null)
  const notify = useMutation({
    mutationFn: () => adminApi.notifyPlus(row.user_id),
    onSuccess: async (data) => {
      setResult(data)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'plus_vencen'] })
    },
  })
  const alreadyToday = row.notified_levels.includes(row.days_left)

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="dark"
        className="h-10 w-auto px-4 text-[15px]"
        disabled={row.push_devices === 0 || alreadyToday || notify.isPending}
        onClick={() => {
          setResult(null)
          notify.mutate()
        }}
      >
        Avisar ahora
      </Button>
      {row.push_devices === 0 && (
        <span className="text-[12px] text-text-muted">Sin dispositivos con avisos</span>
      )}
      {alreadyToday && <span className="text-[12px] text-text-muted">Ya avisado hoy</span>}
      {notify.isError && (
        <span
          role="alert"
          className="max-w-[260px] whitespace-normal text-[13px] font-semibold text-expense"
        >
          {describeNotifyError(notify.error)}
        </span>
      )}
      {result && (
        <span role="status" className="text-[13px] font-semibold">
          Enviado: {result.sent} de {result.recipients}
        </span>
      )}
    </div>
  )
}

/** Plus that really ends soon (no automatic renewal): who was told, and a button to tell them now. */
export function PlusExpiring() {
  const query = useAdminQuery(['plus_vencen', 7], () => adminApi.plusVencen(7))
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock onRetry={() => void query.refetch()} />
  const data = query.data

  return (
    <PanelCard title="Vencen pronto (7 días)">
      <p className="text-[14px] text-text-muted">
        Solo quienes pierden Plus de verdad: {data.auto_renewing_excluded} más vencen pronto pero se
        renuevan solos (suscripción autorizada) y no se listan ni se avisan. El aviso automático
        sale todos los días a las 12:00 para quienes vencen en 3 días y en 1 día.
      </p>
      {data.rows.length === 0 ? (
        <p className="text-[15px]">Nadie pierde Plus en los próximos {data.days} días.</p>
      ) : (
        <TableWrap>
          <table className={`${TABLE} min-w-[860px]`}>
            <thead>
              <tr>
                <th className={TH}>Email</th>
                <th className={TH}>Origen</th>
                <th className={TH}>Vence</th>
                <th className={TH}>Suscripción</th>
                <th className={TH}>Dispositivos</th>
                <th className={TH}>Avisos enviados</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.user_id} className={TR}>
                  <td className={TD}>
                    <Link to={adminPath('usuarios', row.user_id)} className="font-bold underline">
                      {row.email ?? '(sin email)'}
                    </Link>
                  </td>
                  <td className={TD}>{row.source}</td>
                  <td className={TD}>
                    {formatArDate(row.expires_at)} · {daysLeftLabel(row.days_left)}
                  </td>
                  <td className={TD}>{row.subscription_status ?? 'sin suscripción'}</td>
                  <td className={TD}>{row.push_devices}</td>
                  <td className={TD}>
                    {row.notified_levels.length === 0 ? (
                      <span className="text-text-muted">ninguno</span>
                    ) : (
                      <span className="flex gap-1">
                        {row.notified_levels.map((level) => (
                          <Chip key={level}>{level === 0 ? 'hoy' : `${level} d`}</Chip>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className={TD}>
                    <NotifyButton row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </PanelCard>
  )
}
