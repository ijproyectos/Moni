import { useToast } from '@/shared/ui/toastContext'
import { toUserMessage } from '@/shared/lib/errors'
import { Toggle } from '@/shared/ui/kit'
import { SettingRow } from '@/shared/ui/SettingRow'
import { useNoticePrefs, useSetNoticePrefs } from '@/features/debts/api/useDebts'
import type { NoticePrefs } from '@/features/debts/domain/debts'
import { GroupLabel, ProfileGroup } from './ProfilePage'

/**
 * "Avisos de grupos": which push notices arrive and whether they show names and amounts. Saved in Supabase. The notices inside
 * Moni (the Avisos tray) are always there, whatever is chosen here. Hidden while the database does not have the preferences.
 */
export function GroupNoticePrefs() {
  const toast = useToast()
  const prefs = useNoticePrefs()
  const save = useSetNoticePrefs()
  if (!prefs.data) return null
  const current = prefs.data

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
        <SettingRow
          title="Ocultar detalles en la notificación"
          subtitle="Sin nombres ni importes en la pantalla bloqueada"
          trailing={<Toggle label="Ocultar detalles en la notificación" checked={current.hideDetails} onChange={(v) => change({ hideDetails: v })} />}
        />
      </ProfileGroup>
      <p className="px-1 text-[13px] leading-5 text-text-muted">
        Son avisos al celular. Los avisos importantes siempre quedan en Moni, en Avisos de grupos.
      </p>
    </>
  )
}
