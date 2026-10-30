import { Copy } from 'lucide-react'
import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { copyText } from '@/shared/lib/share'
import { Button } from '@/shared/ui/Button'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { isTransferDataNotEnabled } from '../api/accountsRepository'
import { useUpdateTransferData } from '../api/useAccounts'
import {
  hasTransferData,
  transferDataSchema,
  transferNumberLabel,
  type Account,
} from '../domain/account'

const inputClass =
  'h-14 w-full min-w-0 rounded-[18px] border border-sand bg-canvas px-4 text-[17px] font-extrabold text-forest placeholder:font-normal placeholder:text-text-muted'

/**
 * "Datos para transferencias" of a bank or a wallet: an optional alias and CBU / CVU, kept in Supabase. Saving them only
 * edits those two fields (balances and movements do not move). They are shown to nobody: they only go out when the person
 * chooses this account and confirms it while building a summary.
 */
export function TransferDataSection({
  account,
  editing,
  onEdit,
  onDone,
}: {
  account: Account
  editing: boolean
  onEdit: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const update = useUpdateTransferData()
  const numberLabel = transferNumberLabel(account.kind)
  const [alias, setAlias] = useState(account.transferAlias ?? '')
  const [cbu, setCbu] = useState(account.transferCbu ?? '')
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setAlias(account.transferAlias ?? '')
    setCbu(account.transferCbu ?? '')
    setError(null)
    onEdit()
  }

  async function save() {
    setError(null)
    const result = transferDataSchema.safeParse({ alias, cbu })
    if (!result.success) {
      const issue = result.error.issues[0]
      const field = issue?.path[0] === 'cbu' ? numberLabel : 'Alias'
      return setError(`${field}: ${issue?.message ?? 'revisá lo que escribiste.'}`)
    }
    try {
      await update.mutateAsync({ id: account.id, data: result.data })
      toast.show('Datos guardados', { mascotUrl: mascotHappy })
      onDone()
    } catch (e) {
      setError(
        isTransferDataNotEnabled(e)
          ? 'Todavía no se pueden guardar estos datos. Probá de nuevo más tarde.'
          : toUserMessage(e),
      )
    }
  }

  if (editing) {
    return (
      <section className="flex flex-col gap-3 rounded-[24px] border-2 border-forest bg-white p-4">
        <SectionLabel>Datos para transferencias</SectionLabel>
        <label className="flex flex-col gap-1">
          <span className="text-[14px] font-bold text-text-muted">Alias</span>
          <input
            type="text"
            data-autofocus
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="tunombre.mp"
            aria-label="Alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[14px] font-bold text-text-muted">{numberLabel}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={30}
            placeholder="22 números"
            aria-label={numberLabel}
            value={cbu}
            onChange={(e) => setCbu(e.target.value)}
            className={inputClass}
          />
        </label>
        <p className="text-[14px] leading-5 text-text-muted">
          Los dos son opcionales. Dejá un campo vacío para borrarlo.
        </p>
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            onClick={onDone}
            disabled={update.isPending}
            className="border-2 border-sand"
          >
            Cancelar
          </Button>
          <Button variant="dark" onClick={() => void save()} disabled={update.isPending}>
            {update.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </section>
    )
  }

  const rows: { label: string; value: string | null }[] = [
    { label: 'Alias', value: account.transferAlias },
    { label: numberLabel, value: account.transferCbu },
  ].filter((r) => r.value)

  return (
    <section className="rounded-[24px] border border-sand bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Datos para transferencias</SectionLabel>
          {!hasTransferData(account) && (
            <p className="mt-1 text-[15px] leading-5 text-text-muted">
              Sumá tu alias o tu {numberLabel} para pasarlos en los resúmenes de gastos compartidos
              y viajes. Son opcionales.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={startEditing}
          className="min-h-11 shrink-0 rounded-full bg-sand px-4 text-[16px] font-extrabold"
        >
          {hasTransferData(account) ? 'Editar' : 'Agregar'}
        </button>
      </div>
      {rows.length > 0 && (
        <>
          <ul className="mt-2 flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-text-muted">{r.label}</span>
                  <span className="block break-all text-[17px] font-extrabold">{r.value}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Copiar ${r.label.toLowerCase()}`}
                  onClick={() => void copyText(r.value ?? '', toast, `${r.label} copiado`)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sand"
                >
                  <Copy aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] leading-4 text-text-muted">
            Solo se comparten si vos elegís incluirlos en un resumen.
          </p>
        </>
      )}
    </section>
  )
}
