import { useState } from 'react'
import { useToast } from '@/shared/ui/toastContext'
import { toUserMessage } from '@/shared/lib/errors'
import { Toggle } from '@/shared/ui/kit'
import { SettingRow } from '@/shared/ui/SettingRow'
import { useNoticePrefs, useSetNoticePrefs } from '@/features/debts/api/useDebts'
import type { NoticePrefs } from '@/features/debts/domain/debts'
import { usePlanAccess } from '@/features/plus/api/usePlanAccess'
import type { PlusFeature } from '@/features/plus/domain/entitlements'
import { PlusPromoDialog } from '@/features/plus/ui/PlusPromoDialog'
import { PlusTag } from '@/features/plus/ui/PlusTag'
import { useCenterPrefs } from '@/features/notifications/ui/useNotificationCenter'
import type { CenterPrefs } from '@/features/notifications/api/centerRepository'
import { GroupLabel, ProfileGroup } from './ProfilePage'

/**
 * "Avisos de grupos": which push notices arrive and whether they show names and amounts. Saved in Supabase. The notices inside
 * Moni (the Avisos tray) are always there, whatever is chosen here. Hidden while the database does not have the preferences.
 */
export function GroupNoticePrefs() {
  const toast = useToast()
  const prefs = useNoticePrefs()
  const save = useSetNoticePrefs()
  const center = useCenterPrefs()
  const access = usePlanAccess()
  const [promo, setPromo] = useState<PlusFeature | null>(null)
  if (!prefs.data) return null
  const current = prefs.data
  const extra = center.prefs

  function changeExtra(patch: Partial<CenterPrefs>) {
    if (!extra) return
    center.save.mutate({ ...extra, ...patch }, { onError: (e) => toast.show(toUserMessage(e), { tone: 'error' }) })
  }

  /**
   * A Moni Plus option stays visible for everybody. A Free person who tries to turn it on gets the promo and nothing is saved; their
   * switch shows off (the server refuses these too). Whoever had it on before keeps seeing it as it is stored once on Plus again.
   */
  const premium = (feature: PlusFeature, value: boolean, apply: (v: boolean) => void) => ({
    checked: access.canUse(feature) ? value : false,
    onChange: (v: boolean) => (access.canUse(feature) ? apply(v) : setPromo(feature)),
  })

  function change(patch: Partial<NoticePrefs>) {
    save.mutate(
      { ...current, ...patch },
      { onError: (e) => toast.show(toUserMessage(e), { tone: 'error' }) },
    )
  }

  return (
    <>
      <GroupLabel>Avisos de grupos</GroupLabel>
      <ProfileGroup>
        <SettingRow
          title="Recordatorios de pago"
          badge={<PlusTag />}
          subtitle="Cuando alguien te recuerda una deuda"
          trailing={<Toggle label="Recordatorios de pago" {...premium('reminders', current.debtReminders, (v) => change({ debtReminders: v }))} />}
        />
        <SettingRow
          title="Pagos registrados"
          subtitle="Cuando alguien indica que te pagó y tenés que confirmarlo"
          trailing={<Toggle label="Pagos registrados" checked={current.paymentsReported} onChange={(v) => change({ paymentsReported: v })} />}
        />
        <SettingRow
          title="Pagos confirmados o rechazados"
          subtitle="La respuesta a un pago que informaste"
          trailing={<Toggle label="Pagos confirmados o rechazados" checked={current.paymentsAnswered} onChange={(v) => change({ paymentsAnswered: v })} />}
        />
        {extra && (
          <SettingRow
            title="Gastos en los que te incluyen"
            badge={<PlusTag />}
            subtitle="Cuando alguien carga un gasto compartido con vos"
            trailing={<Toggle label="Gastos en los que te incluyen" {...premium('smart_notices', extra.expenseAddedPush, (v) => changeExtra({ expenseAddedPush: v }))} />}
          />
        )}
        <SettingRow
          title="Ocultar detalles en la notificación"
          subtitle="Sin nombres ni importes en la pantalla bloqueada"
          trailing={<Toggle label="Ocultar detalles en la notificación" checked={current.hideDetails} onChange={(v) => change({ hideDetails: v })} />}
        />
      </ProfileGroup>
      <p className="px-1 text-[13px] leading-5 text-text-muted">
        Son avisos al celular. Los avisos importantes siempre quedan en Moni, en Avisos de grupos.
      </p>
      {extra && (
        <>
          <GroupLabel>Notificaciones de Moni Plus</GroupLabel>
          <ProfileGroup>
            <SettingRow
              title="Pagos próximos"
              badge={<PlusTag />}
              trailing={<Toggle label="Pagos próximos" {...premium('smart_notices', extra.paymentsDue, (v) => changeExtra({ paymentsDue: v }))} />}
            />
            <SettingRow
              title="Aumentos de precio"
              badge={<PlusTag />}
              trailing={<Toggle label="Aumentos de precio" {...premium('smart_notices', extra.priceChanges, (v) => changeExtra({ priceChanges: v }))} />}
            />
            <SettingRow
              title="Límites de categorías"
              badge={<PlusTag />}
              trailing={<Toggle label="Límites de categorías" {...premium('smart_notices', extra.budgets, (v) => changeExtra({ budgets: v }))} />}
            />
          </ProfileGroup>
        </>
      )}
      {promo && <PlusPromoDialog feature={promo} onClose={() => setPromo(null)} />}
    </>
  )
}
