import { adminApi } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatArDateTime, formatBytes, formatCount } from '../domain/format'
import { AutomaticNotices } from './AutomaticNotices'
import {
  Chip,
  DetailRow,
  ErrorBlock,
  LoadingBlock,
  PanelCard,
  SinDatos,
  TABLE,
  TD,
  TH,
  TR,
  TableWrap,
} from './widgets'

export function SistemaPage() {
  const query = useAdminQuery(['sistema'], adminApi.sistema)
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock onRetry={() => void query.refetch()} />
  const s = query.data

  return (
    <div className="flex flex-col gap-4">
      <PanelCard title="Base de datos">
        <dl>
          <DetailRow label="Tamaño">{formatBytes(s.db_size_bytes)}</DetailRow>
          <DetailRow label="Última migración">{s.latest_migration ?? 'sin datos'}</DetailRow>
          <DetailRow label="Almacenamiento">
            {s.storage
              ? `${formatCount(s.storage.objects)} archivos · ${formatBytes(s.storage.bytes)}`
              : 'sin datos'}
          </DetailRow>
          <DetailRow label="Acciones de admin (24 h)">{formatCount(s.admin_actions_24h)}</DetailRow>
          <DetailRow label="Datos generados">{formatArDateTime(s.generated_at)}</DetailRow>
        </dl>
      </PanelCard>

      <AutomaticNotices />

      <PanelCard title="Tareas programadas (pg_cron)">
        {s.cron === null ? (
          <SinDatos note="pg_cron no está instalado o no se puede leer." />
        ) : s.cron.length === 0 ? (
          <p className="text-[15px] text-text-muted">No hay tareas programadas.</p>
        ) : (
          <TableWrap>
            <table className={`${TABLE} min-w-[760px]`}>
              <thead>
                <tr>
                  <th className={TH}>Tarea</th>
                  <th className={TH}>Horario</th>
                  <th className={TH}>Activa</th>
                  <th className={TH}>Última ejecución</th>
                  <th className={TH}>Resultado</th>
                  <th className={TH}>24 h (fallas)</th>
                </tr>
              </thead>
              <tbody>
                {s.cron.map((job) => (
                  <tr key={job.jobid} className={TR}>
                    <td className={TD}>{job.name ?? `#${job.jobid}`}</td>
                    <td className={TD}>{job.schedule}</td>
                    <td className={TD}>{job.active ? 'Sí' : 'No'}</td>
                    <td className={TD}>{formatArDateTime(job.last_run_at)}</td>
                    <td className={TD}>
                      <Chip
                        tone={
                          job.last_status === 'failed'
                            ? 'bad'
                            : job.last_status === 'succeeded'
                              ? 'active'
                              : 'neutral'
                        }
                      >
                        {job.last_status ?? '—'}
                      </Chip>
                    </td>
                    <td className={TD}>
                      {job.runs_24h} ({job.failures_24h})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </PanelCard>

      <PanelCard title="Llamadas HTTP de la base (pg_net, 24 h)">
        {s.net_responses_24h ? (
          <dl>
            <DetailRow label="Total">{formatCount(s.net_responses_24h.total_24h)}</DetailRow>
            <DetailRow label="2xx">{formatCount(s.net_responses_24h.ok_2xx)}</DetailRow>
            <DetailRow label="3xx">{formatCount(s.net_responses_24h.redirect_3xx)}</DetailRow>
            <DetailRow label="4xx">{formatCount(s.net_responses_24h.client_4xx)}</DetailRow>
            <DetailRow label="5xx">{formatCount(s.net_responses_24h.server_5xx)}</DetailRow>
            <DetailRow label="Sin respuesta">
              {formatCount(s.net_responses_24h.no_response)}
            </DetailRow>
          </dl>
        ) : (
          <SinDatos note="pg_net no está instalado o no se puede leer." />
        )}
      </PanelCard>

      <PanelCard title="Avisos push">
        <dl>
          <DetailRow label="Dispositivos">{formatCount(s.push.devices)}</DetailRow>
          <DetailRow label="Personas">{formatCount(s.push.users)}</DetailRow>
          <DetailRow label="Mensajes enviados (30 días)">
            {formatCount(s.push.messages_30d)}
          </DetailRow>
          <DetailRow label="Último mensaje">{formatArDateTime(s.push.last_message_at)}</DetailRow>
        </dl>
      </PanelCard>
    </div>
  )
}
