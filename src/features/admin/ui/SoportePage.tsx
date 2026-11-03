import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { adminApi } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatArDateTime, formatCount } from '../domain/format'
import { adminPath } from '../domain/paths'
import type { SupportFilter } from '../domain/types'
import { Chip, ErrorBlock, LoadingBlock, PanelCard, TABLE, TD, TH, TR, TableWrap } from './widgets'

const PAGE_SIZE = 25

const FILTERS: Array<{ value: SupportFilter; label: string }> = [
  { value: 'open', label: 'Abiertas' },
  { value: 'resolved', label: 'Resueltas' },
  { value: 'todas', label: 'Todas' },
]

/** Support inbox: what people wrote to the team, open first. */
export function SoportePage() {
  const [status, setStatus] = useState<SupportFilter>('open')
  const [page, setPage] = useState(0)
  const query = useAdminQuery(['soporte', status, page], () =>
    adminApi.soporte({ status, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
  )
  const total = query.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      <PanelCard>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as SupportFilter)
            setPage(0)
          }}
          aria-label="Estado de las consultas"
          className="h-12 self-start rounded-full border border-sand bg-card px-4 text-[16px] text-ink"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </PanelCard>

      {query.isPending ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock onRetry={() => void query.refetch()} />
      ) : (
        <PanelCard title={`${formatCount(total)} consulta(s)`}>
          {query.data.rows.length === 0 ? (
            <p className="text-[15px] text-text-muted">No hay consultas con ese estado.</p>
          ) : (
            <TableWrap>
              <table className={`${TABLE} min-w-[760px]`}>
                <thead>
                  <tr>
                    <th className={TH}>Asunto</th>
                    <th className={TH}>Email</th>
                    <th className={TH}>Recibida</th>
                    <th className={TH}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.rows.map((row) => (
                    <tr key={row.o_id} className={TR}>
                      <td className={TD}>
                        <Link to={adminPath('soporte', row.o_id)} className="font-bold underline">
                          {row.o_subject}
                        </Link>
                      </td>
                      <td className={TD}>{row.o_email ?? '(sin email)'}</td>
                      <td className={TD}>{formatArDateTime(row.o_created_at)}</td>
                      <td className={TD}>
                        {row.o_status === 'resolved' ? (
                          <Chip>Resuelta</Chip>
                        ) : row.o_replied_at ? (
                          <Chip tone="recent">Respondida</Chip>
                        ) : (
                          <Chip tone="idle">Abierta</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <span className="text-[14px] text-text-muted">
              Página {page + 1} de {pages}
            </span>
            <Button
              variant="ghost"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </PanelCard>
      )}
    </div>
  )
}
