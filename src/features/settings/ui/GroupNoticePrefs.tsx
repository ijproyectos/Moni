import { useToast } from '@/shared/ui/toastContext'
import { toUserMessage } from '@/shared/lib/errors'
import { Toggle } from '@/shared/ui/kit'
import { SettingRow } from '@/shared/ui/SettingRow'
import { useNoticePrefs, useSetNoticePrefs } from '@/features/debts/api/useDebts'
import type { NoticePrefs } from '@/features/debts/domain/debts'
import { usePlus } from '@/features/plus/api/usePlus'
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
  const plus = usePlus()
  if (!prefs.data) return null
  const current = prefs.data
  const extra = center.prefs

  function changeExtra(patch: Partial<CenterPrefs>) {
    if (!extra) return
    center.save.mutate({ ...extra, ...patch }, { onError: (e) => toast.show(toUserMessage(e), { tone: 'error' }) })
  }

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
          subtitle="Cuando alguien te recuerda una deuda"
          trailing={<Toggle label="Recordatorios de pago" checked={current.debtReminders} onChange={(v) => change({ debtReminders: v })} />}
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
            subtitle="Cuando alguien carga un gasto compartido con vos"
            trailing={<Toggle label="Gastos en los que te incluyen" checked={extra.expenseAddedPush} onChange={(v) => changeExtra({ expenseAddedPush: v })} />}
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
      {plus.isPlus && extra && (
        <>
          <GroupLabel>Notificaciones de Moni Plus</GroupLabel>
          <ProfileGroup>
            <SettingRow
              title="Pagos próximos"
              trailing={<Toggle label="Pagos próximos" checked={extra.paymentsDue} onChange={(v) => changeExtra({ paymentsDue: v })} />}
            />
            <SettingRow
              title="Aumentos de precio"
              trailing={<Toggle label="Aumentos de precio" checked={extra.priceChanges} onChange={(v) => changeExtra({ priceChanges: v })} />}
            />
            <SettingRow
              title="Límites de categorías"
              trailing={<Toggle label="Límites de categorías" checked={extra.budgets} onChange={(v) => changeExtra({ budgets: v })} />}
            />
          </ProfileGroup>
        </>
      )}
    </>
  )
}
