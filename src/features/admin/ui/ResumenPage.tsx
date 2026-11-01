import { Link } from 'react-router'
import { adminPath } from '../domain/paths'
import { adminApi } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatCount } from '../domain/format'
import { ErrorBlock, Kpi, KpiGrid, LoadingBlock, PanelCard } from './widgets'

export function ResumenPage() {
  const query = useAdminQuery(['resumen'], adminApi.resumen)
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock onRetry={() => void query.refetch()} />
  const r = query.data
  const a = r.alerts

  const alerts: Array<{ text: string; to: string }> = []
  if (a.mp_needs_reconnect > 0)
    alerts.push({
      text: `${a.mp_needs_reconnect} cuenta(s) de Mercado Pago piden volver a vincular`,
      to: adminPath('mp'),
    })
  if (a.mp_sync_errors > 0)
    alerts.push({
      text: `${a.mp_sync_errors} sincronización(es) de Mercado Pago con error`,
      to: adminPath('mp'),
    })
  if (a.mp_import_failures > 0)
    alerts.push({
      text: `${a.mp_import_failures} pago(s) de Mercado Pago que no se pudieron importar`,
      to: adminPath('mp'),
    })
  if (a.plus_authorized_without_payment > 0)
    alerts.push({
      text: `${a.plus_authorized_without_payment} suscripción(es) Plus autorizadas hace más de 2 días sin pago acreditado`,
      to: adminPath('plus'),
    })
  if ((a.cron_failures_24h ?? 0) > 0)
    alerts.push({
      text: `${a.cron_failures_24h} ejecución(es) de tareas programadas fallaron en 24 h`,
      to: adminPath('sistema'),
    })

  return (
    <div className="flex flex-col gap-4">
      <PanelCard title="Alertas">
        {alerts.length === 0 ? (
          <p className="text-[15px] font-semibold">Todo en orden: sin alertas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <li key={alert.text} className="flex items-center justify-between gap-3 text-[15px]">
                <span>{alert.text}</span>
                <Link to={alert.to} className="shrink-0 font-bold underline">
                  Ver
                </Link>
              </li>
            ))}
          </ul>
        )}
        {a.cron_failures_24h === null && (
          <p className="text-[13px] text-text-muted">
            Las tareas programadas no se pueden leer desde acá (pg_cron no disponible).
          </p>
        )}
      </PanelCard>

      <KpiGrid>
        <Kpi label="Usuarios" value={formatCount(r.users_total)} />
        <Kpi label="Nuevos (7 días)" value={formatCount(r.users_new_7d)} />
        <Kpi label="Nuevos (30 días)" value={formatCount(r.users_new_30d)} />
        <Kpi
          label="Moni Plus activos"
          value={formatCount(r.plus_active)}
          hint={`${formatCount(r.plus_expired)} vencidos`}
        />
        <Kpi label="Activos hoy" value={formatCount(r.active_today)} />
        <Kpi label="Activos (7 días)" value={formatCount(r.active_7d)} />
        <Kpi label="Activos (30 días)" value={formatCount(r.active_30d)} />
        <Kpi label="Mercado Pago vinculado" value={formatCount(r.mp_linked)} />
        <Kpi label="Llamadas de IA hoy" value={formatCount(r.ai_calls_today)} />
        <Kpi label="Llamadas de IA del mes" value={formatCount(r.ai_calls_month)} />
        <Kpi
          label="Costo de IA"
          value="sin datos"
          hint="Moni no registra el costo de cada llamada."
        />
      </KpiGrid>
      <p className="text-[13px] text-text-muted">
        Activo = último ingreso, movimiento cargado o consulta de IA hecha por la persona (lo
        importado automáticamente desde Mercado Pago no cuenta).
      </p>
    </div>
  )
}
