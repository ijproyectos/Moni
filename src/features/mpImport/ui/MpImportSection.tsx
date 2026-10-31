import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { usePlus } from '@/features/plus/api/usePlus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { toUserMessage } from '@/shared/lib/errors'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { useToast } from '@/shared/ui/toastContext'
import {
  useConnectMp,
  useDismissDuplicate,
  useMpConnection,
  useMpDuplicates,
  useMpSuggestions,
  useMpUnimported,
  useSyncNow,
  useUnlinkMp,
} from '../api/useMpImport'
import { mpImportKeys } from '../api/queryKeys'
import { finishPendingLink } from '../api/mpImportRepository'
import { callbackFeedback, type ImportWindow } from '../domain/mpImport'
import { MpConnectionCard } from './MpConnectionCard'
import { MpConsentSheet } from './MpConsentSheet'
import { MpDuplicates, MpSuggestions } from './MpImportInsights'

/**
 * Container of the Mercado Pago import UI inside Medios de pago. It also reads the `?mp=ok|error&reason=` left by
 * public/mp/callback.html, announces the result and removes those params (other params are kept).
 */
export function MpImportSection() {
  const { user } = useAuth()
  const plus = usePlus()
  const online = useOnlineStatus()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const connection = useMpConnection()
  const linked = connection.data != null && connection.data.status !== 'unlinked'
  const duplicates = useMpDuplicates(linked && connection.data?.status !== 'plus_lapsed')
  const suggestions = useMpSuggestions(linked)
  const unimported = useMpUnimported(linked)
  const connect = useConnectMp()
  const sync = useSyncNow()
  const unlink = useUnlinkMp()
  const dismiss = useDismissDuplicate()
  const [consenting, setConsenting] = useState(false)
  const [confirmingUnlink, setConfirmingUnlink] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  useEffect(() => {
    const feedback = callbackFeedback(params)
    if (!feedback) return
    toast.show(feedback.message, { tone: feedback.tone })
    if (feedback.tone === 'success') {
      void queryClient.invalidateQueries({ queryKey: mpImportKeys.all(user?.id) })
    }
    const next = new URLSearchParams(params)
    next.delete('mp')
    next.delete('reason')
    setParams(next, { replace: true })
  }, [params, setParams, toast, queryClient, user?.id])

  // callback.html parked code/state because its stored session had expired: finish with the app's fresh session.
  const finishing = useRef(false)
  const pending = params.get('mp') === 'pending'
  useEffect(() => {
    if (!pending || finishing.current) return
    finishing.current = true
    const next = new URLSearchParams(params)
    next.delete('mp')
    setParams(next, { replace: true })
    void finishPendingLink()
      .then((finished) => {
        const feedback = callbackFeedback(
          new URLSearchParams(finished ? { mp: 'ok' } : { mp: 'error', reason: 'session_required' }),
        )
        if (feedback) toast.show(feedback.message, { tone: feedback.tone })
        if (finished) void queryClient.invalidateQueries({ queryKey: mpImportKeys.all(user?.id) })
      })
      .catch((e: unknown) => {
        const reason = e instanceof Error && 'code' in e ? String((e as { code: unknown }).code) : 'error'
        const feedback = callbackFeedback(new URLSearchParams({ mp: 'error', reason }))
        if (feedback) toast.show(feedback.message, { tone: 'error' })
      })
      .finally(() => {
        finishing.current = false
      })
  }, [pending, params, setParams, toast, queryClient, user?.id])

  async function startConnect(window: ImportWindow) {
    setConnectError(null)
    try {
      await connect.mutateAsync(window)
    } catch (e) {
      setConnectError(toUserMessage(e))
    }
  }

  async function runSync() {
    try {
      await sync.mutateAsync()
      toast.show('Estamos sincronizando tus pagos. En unos minutos aparecen.')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  async function confirmUnlink() {
    try {
      await unlink.mutateAsync()
      toast.show('Mercado Pago desvinculado. Tus gastos se mantienen.')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
    setConfirmingUnlink(false)
  }

  async function dismissDuplicate(paymentId: string) {
    try {
      await dismiss.mutateAsync(paymentId)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  return (
    <>
      <MpConnectionCard
        connection={connection.data ?? null}
        isPlus={plus.isPlus}
        isFree={plus.isFree}
        offline={!online}
        unimportedCount={unimported.data ?? 0}
        busy={
          sync.isPending
            ? 'sync'
            : unlink.isPending
              ? 'unlink'
              : connect.isPending
                ? 'connect'
                : null
        }
        onConnect={() => {
          setConnectError(null)
          setConsenting(true)
        }}
        onSync={() => void runSync()}
        onUnlink={() => setConfirmingUnlink(true)}
        onUpgrade={() => setUpgrading(true)}
      />
      {linked && (
        <>
          <MpDuplicates
            items={duplicates.data ?? []}
            offline={!online}
            onDismiss={(id) => void dismissDuplicate(id)}
          />
          <MpSuggestions items={suggestions.data ?? []} />
        </>
      )}
      {consenting && (
        <MpConsentSheet
          onClose={() => setConsenting(false)}
          onConfirm={(window) => void startConnect(window)}
          isPending={connect.isPending}
          error={connectError}
          offline={!online}
        />
      )}
      {confirmingUnlink && (
        <ConfirmDialog
          title="¿Desvincular Mercado Pago?"
          message="Dejamos de importar tus pagos. Los gastos que ya cargamos se mantienen. Para revocar el acceso del todo, también podés sacar Moni de las aplicaciones conectadas de tu cuenta de Mercado Pago."
          confirmLabel="Sí, desvincular"
          isBusy={unlink.isPending}
          onConfirm={() => void confirmUnlink()}
          onCancel={() => setConfirmingUnlink(false)}
        />
      )}
      {upgrading && <PlusSheet reason="mp_import" onClose={() => setUpgrading(false)} />}
    </>
  )
}
