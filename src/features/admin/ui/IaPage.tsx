import { Link } from 'react-router'
import { toBars } from '../domain/bars'
import { adminPath } from '../domain/paths'
import { adminApi } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatCount } from '../domain/format'
import {
  BarChart,
  ErrorBlock,
  HBar,
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

export function IaPage() {
  const query = useAdminQuery(['ia'], adminApi.ia)
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock onRetry={() => void query.refetch()} />
  const ia = query.data
  const maxFeature = Math.max(1, ...ia.by_feature_30d.map((f) => f.calls))

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <Kpi label="Llamadas hoy" value={formatCount(ia.calls_today)} />
        <Kpi label="Llamadas del mes" value={formatCount(ia.calls_month)} />
        <Kpi label="Costo de hoy" value="sin datos" />
        <Kpi label="Costo del mes" value="sin datos" />
      </KpiGrid>

      {!ia.cost_tracked && (
        <PanelCard title="Costos">
          <SinDatos note="Moni guarda una fila por llamada de IA (quién, qué función y cuándo), pero no el modelo, los tokens ni el costo. Para ver USD hace falta registrarlos." />
        </PanelCard>
      )}

      <PanelCard title="Llamadas por día (30 días)">
        <BarChart title="Llamadas de IA por día" data={toBars(ia.daily, (d) => d.calls)} />
      </PanelCard>

      <PanelCard title="Por función (30 días)">
        {ia.by_feature_30d.length === 0 ? (
          <p className="text-[15px] text-text-muted">Sin llamadas en el período.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {ia.by_feature_30d.map((f) => (
              <HBar key={f.feature} label={f.feature} value={f.calls} max={maxFeature} />
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard title="Quiénes más usan IA este mes">
        {ia.top_users_month.length === 0 ? (
          <p className="text-[15px] text-text-muted">Sin llamadas este mes.</p>
        ) : (
          <TableWrap>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Email</th>
                  <th className={TH}>Llamadas</th>
                </tr>
              </thead>
              <tbody>
                {ia.top_users_month.map((row) => (
                  <tr key={row.user_id} className={TR}>
                    <td className={TD}>
                      <Link to={adminPath('usuarios', row.user_id)} className="font-bold underline">
                        {row.email ?? row.user_id}
                      </Link>
                    </td>
                    <td className={TD}>{formatCount(row.calls)}</td>
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
