import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { connectionNotice, formatLastSync, unimportedNotice, type MpConnection } from '../domain/mpImport'

interface MpConnectionCardProps {
  connection: MpConnection | null
  /** Plus is running. */
  isPlus: boolean
  /** The server answered and the person is on Free. */
  isFree: boolean
  offline: boolean
  /** Payments the import gave up on after repeated failures. */
  unimportedCount?: number
  busy?: 'connect' | 'sync' | 'unlink' | null
  onConnect: () => void
  onSync: () => void
  onUnlink: () => void
  onUpgrade: () => void
}

/**
 * Mercado Pago import card (presentational). Free users get the upsell instead of a button that would fail; a lapsed
 * Plus keeps the connection visible (and unlinkable) with the import paused.
 */
export function MpConnectionCard({
  connection,
  isPlus,
  isFree,
  offline,
  unimportedCount = 0,
  busy = null,
  onConnect,
  onSync,
  onUnlink,
  onUpgrade,
}: MpConnectionCardProps) {
  const status = connection && connection.status !== 'unlinked' ? connection.status : null
  const lastSync = connection ? formatLastSync(connection.lastSyncAt) : null
  const notice = status === 'active' ? connectionNotice(connection?.lastErrorClass ?? null) : null

  const unimported = status === 'active' ? unimportedNotice(unimportedCount) : null

  if (!status && !isPlus && !isFree) return null

  return (
    <Card className="flex flex-col gap-3" aria-label="Mercado Pago">
      <h3 className="font-display text-[20px] font-extrabold leading-6 text-ink">
        Importar gastos de Mercado Pago
      </h3>

      {!status && isFree && (
        <>
          <p className="text-[16px] leading-6 text-text-muted">
            Con Moni Plus tus pagos de Mercado Pago aparecen solos como gastos, ya categorizados.
          </p>
          <Button variant="dark" onClick={onUpgrade}>
            Conocer Moni Plus
          </Button>
        </>
      )}

      {!status && isPlus && (
        <>
          <p className="text-[16px] leading-6 text-text-muted">
            Vinculá tu cuenta y Moni carga tus pagos como gastos cada pocos minutos, aunque la app
            esté cerrada.
          </p>
          <Button variant="dark" onClick={onConnect} disabled={offline || busy === 'connect'}>
            Vincular Mercado Pago
          </Button>
        </>
      )}

      {status === 'active' && (
        <>
          <p className="text-[16px] font-extrabold leading-6 text-ink">Conectado</p>
          <p className="text-[15px] leading-5 text-text-muted">
            {lastSync ? `Última actualización: ${lastSync}` : 'Todavía no sincronizó.'}
          </p>
          {notice && (
            <p role="status" className="text-[15px] leading-5 text-expense">
              {notice}
            </p>
          )}
          {unimported && <p className="text-[15px] leading-5 text-text-muted">{unimported}</p>}
          <Button variant="dark" onClick={onSync} disabled={offline || busy === 'sync'}>
            {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Button>
        </>
      )}

      {status === 'needs_reconnect' && (
        <>
          <p role="status" className="text-[16px] leading-6 text-expense">
            Se cortó la conexión con Mercado Pago. Volvé a vincular tu cuenta para seguir
            importando; tus gastos ya cargados se mantienen.
          </p>
          <Button variant="dark" onClick={onConnect} disabled={offline || busy === 'connect'}>
            Volver a vincular
          </Button>
        </>
      )}

      {status === 'plus_lapsed' && (
        <>
          <p className="text-[16px] leading-6 text-text-muted">
            La importación está en pausa porque terminó tu Moni Plus. Tus gastos ya cargados se
            mantienen y se reanuda sola cuando lo reactives.
          </p>
          <Button variant="dark" onClick={onUpgrade}>
            Reactivar con Moni Plus
          </Button>
        </>
      )}

      {status && (
        <Button
          variant="ghost"
          onClick={onUnlink}
          disabled={offline || busy === 'unlink'}
          className="text-ink"
        >
          Desvincular
        </Button>
      )}
      {offline && <p className="text-center text-sm text-text-muted">{OFFLINE_MESSAGE}</p>}
    </Card>
  )
}
