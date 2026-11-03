import { Link } from 'react-router'
import { toBars } from '../domain/bars'
import { adminPath } from '../domain/paths'
import { adminApi } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatArDate, formatArDateTime, formatCount, formatPesos } from '../domain/format'
import { PlusExpiring } from './PlusExpiring'
import {
  BarChart,
  ErrorBlock,
  Kpi,
  KpiGrid,
  LoadingBlock,
  PanelCard,
  TABLE,
  TD,
  TH,
  TR,
  TableWrap,
} from './widgets'

export function PlusPage() {
  const query = useAdminQuery(['plus'], adminApi.plus)
  if (query.isPending) return <LoadingBlock />
  if (query.isError) return <ErrorBlock onRetry={() => void query.refetch()} />
  const p = query.data

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <Kpi
          label="Plus activos"
          value={formatCount(p.entitlements.active)}
          hint={`${p.entitlements.active_mercadopago} Mercado Pago · ${p.entitlements.active_promo} promo`}
        />
        <Kpi label="Vencen en 7 días" value={formatCount(p.entitlements.expiring_7d)} />
        <Kpi label="Vencidos" value={formatCount(p.entitlements.expired)} />
        <Kpi
          label="Ingresos (30 días)"
          value={formatPesos(p.revenue.last_30d)}
          hint={`${p.revenue.payments_30d} pago(s) · total ${formatPesos(p.revenue.total)}`}
        />
        <Kpi label="Suscripciones autorizadas" value={formatCount(p.subscriptions.authorized)} />
        <Kpi label="Pendientes" value={formatCount(p.subscriptions.pending)} />
        <Kpi label="Pausadas" value={formatCount(p.subscriptions.paused)} />
        <Kpi label="Canceladas" value={formatCount(p.subscriptions.cancelled)} />
      </KpiGrid>

      <PlusExpiring />

      <PanelCard title="Ingresos por día (ARS, 30 días)">
        <BarChart
          title="Ingresos por día"
          data={toBars(p.revenue.daily, (d) => d.amount)}
          format={formatPesos}
        />
      </PanelCard>

      <PanelCard title="Autorizadas sin pago acreditado (más de 2 días)">
        {p.not_credited.length === 0 ? (
          <p className="text-[15px]">Ninguna.</p>
        ) : (
          <TableWrap>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Email</th>
                  <th className={TH}>Suscripción creada</th>
                </tr>
              </thead>
              <tbody>
                {p.not_credited.map((row) => (
                  <tr key={`${row.user_id}-${row.subscription_created_at}`} className={TR}>
                    <td className={TD}>
                      <Link to={adminPath('usuarios', row.user_id)} className="font-bold underline">
                        {row.email ?? row.user_id}
                      </Link>
                    </td>
                    <td className={TD}>{formatArDate(row.subscription_created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="text-[13px] text-text-muted">
          Moni no guarda un registro de "pago no acreditado": esta lista es una aproximación
          (suscripción autorizada que nunca recibió un pago).
        </p>
      </PanelCard>

      <PanelCard title="Últimos pagos">
        {p.recent_payments.length === 0 ? (
          <p className="text-[15px] text-text-muted">Todavía no hay pagos.</p>
        ) : (
          <TableWrap>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Email</th>
                  <th className={TH}>Monto</th>
                  <th className={TH}>Pago (id MP)</th>
                </tr>
              </thead>
              <tbody>
                {p.recent_payments.map((row) => (
                  <tr key={row.payment_id} className={TR}>
                    <td className={TD}>{formatArDateTime(row.created_at)}</td>
                    <td className={TD}>
                      <Link to={adminPath('usuarios', row.user_id)} className="font-bold underline">
                        {row.email ?? row.user_id}
                      </Link>
                    </td>
                    <td className={TD}>{formatPesos(row.amount)}</td>
                    <td className={TD}>{row.payment_id}</td>
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
