import { Link, useParams } from 'react-router'
import { toBars } from '../domain/bars'
import { adminPath } from '../domain/paths'
import { adminApi, AdminApiError } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatArDate, formatArDateTime, formatCount, formatPesos } from '../domain/format'
import { PushToUser } from './PushToUser'
import {
  BarChart,
  Chip,
  DaysInactiveChip,
  DetailRow,
  ErrorBlock,
  LoadingBlock,
  PanelCard,
  TABLE,
  TD,
  TH,
  TR,
  TableWrap,
} from './widgets'

export function UsuarioPage() {
  const { id = '' } = useParams()
  const query = useAdminQuery(['usuario', id], () => adminApi.usuario(id))

  if (query.isPending) return <LoadingBlock />
  if (query.isError) {
    const notFound =
      query.error instanceof AdminApiError &&
      (query.error.status === 404 || query.error.status === 400)
    return notFound ? (
      <PanelCard>
        <p className="text-[15px]">No encontramos a ese usuario.</p>
        <Link to={adminPath('usuarios')} className="font-bold underline">
          Volver a usuarios
        </Link>
      </PanelCard>
    ) : (
      <ErrorBlock onRetry={() => void query.refetch()} />
    )
  }
  const u = query.data

  return (
    <div className="flex flex-col gap-4">
      <Link to={adminPath('usuarios')} className="text-[15px] font-bold underline">
        ← Usuarios
      </Link>
      <PanelCard title="Cuenta">
        <dl>
          <DetailRow label="Email">{u.email ?? '(sin email)'}</DetailRow>
          <DetailRow label="Nombre">{u.name ?? '—'}</DetailRow>
          <DetailRow label="Alta">{formatArDateTime(u.created_at)}</DetailRow>
          <DetailRow label="Último ingreso">{formatArDateTime(u.last_sign_in_at)}</DetailRow>
          <DetailRow label="Última actividad">{formatArDateTime(u.last_activity_at)}</DetailRow>
          <DetailRow label="Estado">
            <DaysInactiveChip days={u.days_inactive} />
          </DetailRow>
          <DetailRow label="Email confirmado">{u.email_confirmed ? 'Sí' : 'No'}</DetailRow>
          <DetailRow label="Ingreso con">
            {u.providers.length > 0 ? u.providers.join(', ') : '—'}
          </DetailRow>
          <DetailRow label="Onboarding completo">{u.onboarded ? 'Sí' : 'No'}</DetailRow>
        </dl>
      </PanelCard>

      <PanelCard title="Uso (solo cantidades)">
        <dl>
          <DetailRow label="Movimientos">{formatCount(u.counts.movements_total)}</DetailRow>
          <DetailRow label="Movimientos (30 días)">{formatCount(u.counts.movements_30d)}</DetailRow>
          <DetailRow label="Cuentas">{formatCount(u.counts.accounts)}</DetailRow>
          <DetailRow label="Llamadas de IA (30 días)">
            {formatCount(u.counts.ai_calls_30d)}
          </DetailRow>
          <DetailRow label="Dispositivos con avisos">
            {formatCount(u.counts.push_devices)}
          </DetailRow>
        </dl>
        <BarChart
          title="Movimientos cargados por día (30 días)"
          data={toBars(u.daily, (d) => d.movements)}
        />
        <BarChart
          title="Llamadas de IA por día (30 días)"
          data={toBars(u.daily, (d) => d.ai_calls)}
        />
        {u.ai_by_feature_30d.length > 0 && (
          <p className="text-[14px] text-text-muted">
            IA por función: {u.ai_by_feature_30d.map((f) => `${f.feature} ${f.calls}`).join(' · ')}.
            Costo: sin datos.
          </p>
        )}
      </PanelCard>

      <PanelCard title="Moni Plus">
        {u.plus.entitlement ? (
          <dl>
            <DetailRow label="Estado">
              <Chip tone={u.plus.entitlement.active ? 'active' : 'neutral'}>
                {u.plus.entitlement.active ? 'Activo' : 'Vencido'}
              </Chip>
            </DetailRow>
            <DetailRow label="Origen">{u.plus.entitlement.source}</DetailRow>
            <DetailRow label="Desde">{formatArDate(u.plus.entitlement.granted_at)}</DetailRow>
            <DetailRow label="Vence">{formatArDate(u.plus.entitlement.expires_at)}</DetailRow>
          </dl>
        ) : (
          <p className="text-[15px] text-text-muted">Nunca tuvo Moni Plus.</p>
        )}
        {u.plus.subscriptions.length > 0 && (
          <TableWrap>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Suscripción</th>
                  <th className={TH}>Creada</th>
                  <th className={TH}>Actualizada</th>
                </tr>
              </thead>
              <tbody>
                {u.plus.subscriptions.map((s, i) => (
                  <tr key={`${s.created_at}-${i}`} className={TR}>
                    <td className={TD}>
                      <Chip>{s.status}</Chip>
                    </td>
                    <td className={TD}>{formatArDateTime(s.created_at)}</td>
                    <td className={TD}>{formatArDateTime(s.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {u.plus.payments.length > 0 && (
          <TableWrap>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Pago (id MP)</th>
                  <th className={TH}>Monto</th>
                  <th className={TH}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {u.plus.payments.map((p) => (
                  <tr key={p.payment_id} className={TR}>
                    <td className={TD}>{p.payment_id}</td>
                    <td className={TD}>{formatPesos(p.amount)}</td>
                    <td className={TD}>{formatArDateTime(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {u.plus.promo_redemptions > 0 && (
          <p className="text-[14px] text-text-muted">
            Códigos promocionales canjeados: {u.plus.promo_redemptions}.
          </p>
        )}
      </PanelCard>

      <PanelCard title="Mercado Pago">
        {u.mp ? (
          <dl>
            <DetailRow label="Vínculo">
              <Chip
                tone={
                  u.mp.status === 'active'
                    ? 'active'
                    : u.mp.status === 'unlinked'
                      ? 'neutral'
                      : 'bad'
                }
              >
                {u.mp.status}
              </Chip>
            </DetailRow>
            <DetailRow label="Vinculado el">{formatArDateTime(u.mp.connected_at)}</DetailRow>
            <DetailRow label="Última sincronización">
              {formatArDateTime(u.mp.last_sync_at)}
            </DetailRow>
            <DetailRow label="Resultado">{u.mp.last_sync_status ?? '—'}</DetailRow>
            <DetailRow label="Último error">{u.mp.last_error_class ?? '—'}</DetailRow>
            <DetailRow label="Fallos seguidos">{u.mp.consecutive_failures}</DetailRow>
            <DetailRow label="Pagos importados (30 días)">
              {formatCount(u.mp.imported_30d)}
            </DetailRow>
            <DetailRow label="Pendientes de revisar">{formatCount(u.mp.needs_review)}</DetailRow>
            <DetailRow label="Pagos que no se pudieron importar">
              {formatCount(u.mp.poison_rows)}
            </DetailRow>
          </dl>
        ) : (
          <p className="text-[15px] text-text-muted">No vinculó Mercado Pago.</p>
        )}
      </PanelCard>

      <PushToUser userId={u.user_id} devices={u.counts.push_devices} />
    </div>
  )
}
