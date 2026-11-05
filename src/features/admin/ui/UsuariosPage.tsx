import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { adminPath } from '../domain/paths'
import { adminApi } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatArDate, formatArDateTime, formatCount } from '../domain/format'
import type { UserFilter } from '../domain/types'
import {
  Chip,
  DaysInactiveChip,
  ErrorBlock,
  LoadingBlock,
  PanelCard,
  TABLE,
  TD,
  TH,
  TR,
  TableWrap,
} from './widgets'

const PAGE_SIZE = 25

const FILTERS: Array<{ value: UserFilter; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'plus', label: 'Plus' },
  { value: 'inactivos_7', label: 'Inactivos +7 días' },
  { value: 'inactivos_30', label: 'Inactivos +30 días' },
  { value: 'mp_vinculado', label: 'Con Mercado Pago' },
]

export function UsuariosPage() {
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<UserFilter>('todos')
  const [page, setPage] = useState(0)

  // Debounce the search so each keystroke does not hit the function.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(typed.trim())
      setPage(0)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [typed])

  const query = useAdminQuery(['usuarios', search, filter, page], () =>
    adminApi.usuarios({ search, filter, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
  )
  const total = query.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      <PanelCard>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="search"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Buscar por email"
            aria-label="Buscar por email"
            maxLength={100}
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-card px-5 text-[16px] text-ink placeholder:text-placeholder"
          />
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as UserFilter)
              setPage(0)
            }}
            aria-label="Filtro"
            className="h-12 rounded-full border border-line bg-card px-4 text-[16px] text-ink"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </PanelCard>

      {query.isPending ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock onRetry={() => void query.refetch()} />
      ) : (
        <PanelCard title={`${formatCount(total)} usuario(s)`}>
          {query.data.rows.length === 0 ? (
            <p className="text-[15px] text-text-muted">No hay usuarios con ese criterio.</p>
          ) : (
            <TableWrap>
              <table className={`${TABLE} min-w-[980px]`}>
                <thead>
                  <tr>
                    <th className={TH}>Email</th>
                    <th className={TH}>Alta</th>
                    <th className={TH}>Último ingreso</th>
                    <th className={TH}>Actividad</th>
                    <th className={TH}>Plus</th>
                    <th className={TH}>MP</th>
                    <th className={TH}>Mov.</th>
                    <th className={TH}>Cuentas</th>
                    <th className={TH}>Mov. 30 d</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.rows.map((row) => (
                    <tr key={row.o_user_id} className={TR}>
                      <td className={TD}>
                        <Link
                          to={adminPath('usuarios', row.o_user_id)}
                          className="font-bold underline"
                        >
                          {row.o_email ?? '(sin email)'}
                        </Link>
                        {row.o_suspended && (
                          <span className="ml-2">
                            <Chip tone="bad">Suspendida</Chip>
                          </span>
                        )}
                      </td>
                      <td className={TD}>{formatArDate(row.o_created_at)}</td>
                      <td className={TD}>{formatArDateTime(row.o_last_sign_in_at)}</td>
                      <td className={TD}>
                        <DaysInactiveChip days={row.o_days_inactive} />
                      </td>
                      <td className={TD}>
                        {row.o_plus_active ? (
                          <Chip tone="active">hasta {formatArDate(row.o_plus_expires_at)}</Chip>
                        ) : row.o_plus_expires_at ? (
                          <Chip>venció {formatArDate(row.o_plus_expires_at)}</Chip>
                        ) : (
                          <span className="text-text-muted">Free</span>
                        )}
                      </td>
                      <td className={TD}>{row.o_mp_linked ? 'Sí' : 'No'}</td>
                      <td className={TD}>{formatCount(row.o_movements_total)}</td>
                      <td className={TD}>{formatCount(row.o_accounts_total)}</td>
                      <td className={TD}>{formatCount(row.o_movements_30d)}</td>
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
