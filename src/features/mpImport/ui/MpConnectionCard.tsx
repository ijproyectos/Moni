import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { Button } from '@/shared/ui/Button'
import { findBrand } from '@/features/accounts/domain/bankCatalog'
import { BrandLogo } from '@/features/accounts/ui/BrandLogo'
import type { ButtonHTMLAttributes } from 'react'
import { connectionNotice, formatLastSync, unimportedNotice, type MpConnection } from '../domain/mpImport'

const MP_BLUE = '#009EE3'

/** Mercado Pago's blue action button. */
function MpButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="min-h-11 w-full rounded-full bg-[#009EE3] px-4 text-[15px] font-extrabold text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009EE3] enabled:active:brightness-95 disabled:opacity-60"
    />
  )
}

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
  const mpBrand = findBrand('mercado-pago')

  return (
    <section aria-label="Mercado Pago" className="overflow-hidden rounded-[22px] border border-[#009EE3]/40 bg-card">
      <header className="flex items-center gap-3 bg-[linear-gradient(135deg,#009EE3,#00B1EA)] px-4 py-3 text-white">
        {mpBrand && <BrandLogo brand={mpBrand} size="sm" />}
        <div className="min-w-0">
          <h3 className="font-display text-[16px] font-extrabold leading-tight">Importar gastos de Mercado Pago</h3>
          <p className="text-[12px] opacity-90">{status === 'active' ? 'Conectado' : 'Integración con tu cuenta'}</p>
        </div>
      </header>
      <div className="flex flex-col gap-2.5 px-4 py-3.5" style={{ accentColor: MP_BLUE }}>

      {!status && isFree && (
        <>
          <p className="text-[16px] leading-6 text-text-muted">
            Con Moni Plus tus pagos de Mercado Pago aparecen solos como gastos, ya categorizados.
          </p>
          <MpButton onClick={onUpgrade}>
            Conocer Moni Plus
          </MpButton>
        </>
      )}

      {!status && isPlus && (
        <>
          <p className="text-[16px] leading-6 text-text-muted">
            Vinculá tu cuenta y Moni carga tus pagos como gastos cada pocos minutos, aunque la app
            esté cerrada.
          </p>
          <MpButton onClick={onConnect} disabled={offline || busy === 'connect'}>
            Vincular Mercado Pago
          </MpButton>
        </>
      )}

      {status === 'active' && (
        <>
          <p className="text-[15px] leading-5 text-text-muted">
            {lastSync ? `Última actualización: ${lastSync}` : 'Todavía no sincronizó.'}
          </p>
          {notice && (
            <p role="status" className="text-[15px] leading-5 text-expense">
              {notice}
            </p>
          )}
          {unimported && <p className="text-[15px] leading-5 text-text-muted">{unimported}</p>}
          <MpButton onClick={onSync} disabled={offline || busy === 'sync'}>
            {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar ahora'}
          </MpButton>
        </>
      )}

      {status === 'needs_reconnect' && (
        <>
          <p role="status" className="text-[16px] leading-6 text-expense">
            Se cortó la conexión con Mercado Pago. Volvé a vincular tu cuenta para seguir
            importando; tus gastos ya cargados se mantienen.
          </p>
          <MpButton onClick={onConnect} disabled={offline || busy === 'connect'}>
            Volver a vincular
          </MpButton>
        </>
      )}

      {status === 'plus_lapsed' && (
        <>
          <p className="text-[16px] leading-6 text-text-muted">
            La importación está en pausa porque terminó tu Moni Plus. Tus gastos ya cargados se
            mantienen y se reanuda sola cuando lo reactives.
          </p>
          <MpButton onClick={onUpgrade}>
            Reactivar con Moni Plus
          </MpButton>
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
      </div>
    </section>
  )
}
