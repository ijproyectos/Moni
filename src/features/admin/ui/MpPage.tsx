import { Link } from 'react-router'
import { adminPath } from '../domain/paths'
import { adminApi } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatArDateTime, formatCount } from '../domain/format'
import {
  Chip,
  ErrorBlock,
  Kpi,
  KpiGrid,
  LoadingBlock,
  PanelCard,
  SinDatos,
  TABLE,
  TD,
  TH,
  TR,
  TableWrap,
} from './widgets'

export function MpPage() {
  const query = useAdminQuery(['mp'], adminApi.mp)
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock onRetry={() => void query.refetch()} />
  const m = query.data

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <Kpi label="Vinculaciones activas" value={formatCount(m.connections.active)} />
        <Kpi
          label="Piden re-vincular"
          value={formatCount(m.connections.needs_reconnect)}
          tone={m.connections.needs_reconnect > 0 ? 'warn' : 'default'}
        />
        <Kpi label="Plus vencido" value={formatCount(m.connections.plus_lapsed)} />
        <Kpi label="Desvinculadas" value={formatCount(m.connections.unlinked)} />
        <Kpi
          label="Última sync OK"
          value={formatCount(m.last_sync.ok)}
          hint={`${m.last_sync.partial} parcial · ${m.last_sync.never} sin sincronizar`}
        />
        <Kpi
          label="Última sync con error"
          value={formatCount(m.last_sync.error)}
          tone={m.last_sync.error > 0 ? 'warn' : 'default'}
        />
        <Kpi label="Sin sincronizar hace +1 h" value={formatCount(m.last_sync.stale_over_1h)} />
        <Kpi
          label="Pagos que no se pudieron importar"
          value={formatCount(m.imports.poison_rows)}
          tone={m.imports.poison_rows > 0 ? 'warn' : 'default'}
        />
        <Kpi
          label="Importados (30 días)"
          value={formatCount(m.imports.posted_30d)}
          hint={`${m.imports.voided_30d} anulados`}
        />
        <Kpi label="Pendientes de revisar" value={formatCount(m.imports.needs_review)} />
      </KpiGrid>

      <PanelCard title="Tarea programada (moni-mp-sync)">
        {m.cron ? (
          <dl className="text-[15px]">
            <p>
              Última ejecución: {formatArDateTime(m.cron.last_run_at)} · {m.cron.last_status ?? '—'}
            </p>
            <p>
              En 24 h: {m.cron.runs_24h} ejecuciones, {m.cron.failures_24h} con falla.
            </p>
          </dl>
        ) : (
          <SinDatos note="No se puede leer pg_cron (no instalado o sin permisos) o el job no existe." />
        )}
      </PanelCard>

      {m.errors_by_class.length > 0 && (
        <PanelCard title="Errores por tipo">
          <ul className="flex flex-wrap gap-2">
            {m.errors_by_class.map((e) => (
              <li key={e.class}>
                <Chip tone="bad">
                  {e.class}: {e.connections}
                </Chip>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      <PanelCard title="Cuentas con problemas">
        {m.with_problems.length === 0 ? (
          <p className="text-[15px]">Ninguna.</p>
        ) : (
          <TableWrap>
            <table className={`${TABLE} min-w-[760px]`}>
              <thead>
                <tr>
                  <th className={TH}>Email</th>
                  <th className={TH}>Estado</th>
                  <th className={TH}>Última sync</th>
                  <th className={TH}>Resultado</th>
                  <th className={TH}>Error</th>
                  <th className={TH}>Fallos seguidos</th>
                </tr>
              </thead>
              <tbody>
                {m.with_problems.map((row) => (
                  <tr key={row.user_id} className={TR}>
                    <td className={TD}>
                      <Link to={adminPath('usuarios', row.user_id)} className="font-bold underline">
                        {row.email ?? row.user_id}
                      </Link>
                    </td>
                    <td className={TD}>
                      <Chip tone={row.status === 'needs_reconnect' ? 'bad' : 'neutral'}>
                        {row.status}
                      </Chip>
                    </td>
                    <td className={TD}>{formatArDateTime(row.last_sync_at)}</td>
                    <td className={TD}>{row.last_sync_status ?? '—'}</td>
                    <td className={TD}>{row.last_error_class ?? '—'}</td>
                    <td className={TD}>{row.consecutive_failures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </PanelCard>
    </div>
  )
}
