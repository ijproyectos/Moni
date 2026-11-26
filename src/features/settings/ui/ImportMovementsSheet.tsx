import { useRef, useState } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { usePlus } from '@/features/plus/api/usePlus'
import { PlusPromoDialog } from '@/features/plus/ui/PlusPromoDialog'
import { useCategories } from '@/features/categories/api/useCategories'
import { useImportTransactions } from '@/features/transactions/api/useTransactions'
import { toUserMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/ui/Button'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { useToast } from '@/shared/ui/toastContext'
import {
  parseMovementRows,
  type MovementRowLookups,
  type ParsedMovementsWorkbook,
} from '../domain/movementsWorkbook'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 10_000

type Step =
  | { kind: 'idle'; error: string | null }
  | { kind: 'preview'; parsed: ParsedMovementsWorkbook }
  | { kind: 'importing'; parsed: ParsedMovementsWorkbook }
  | { kind: 'done'; imported: number; failed: number }

async function readWorkbookRows(file: File): Promise<unknown[][]> {
  // Loaded on demand: exceljs is heavy and most people never import, so it should not bloat the main bundle.
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.worksheets[0]
  if (!sheet) return []
  const rows: unknown[][] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // header
    rows.push([1, 2, 3, 4, 5, 6].map((col) => row.getCell(col).value as unknown))
  })
  return rows
}

interface ImportMovementsSheetProps {
  onClose: () => void
}

/** "Importar desde Excel": pick a .xlsx built from our own export, preview what would come in, then confirm. */
function ImportMovementsCapture({ onClose }: ImportMovementsSheetProps) {
  const toast = useToast()
  const categories = useCategories()
  const accounts = useAccounts()
  const importTransactions = useImportTransactions()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>({ kind: 'idle', error: null })

  async function handlePick(file: File | undefined) {
    if (!file) return
    if (!categories.data || !accounts.data) {
      setStep({ kind: 'idle', error: 'Esperá que termine de cargar tu cuenta e intentá de nuevo.' })
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setStep({ kind: 'idle', error: 'El archivo pesa más de 5 MB. Dividilo en partes más chicas.' })
      return
    }
    try {
      const dataRows = await readWorkbookRows(file)
      if (dataRows.length > MAX_ROWS) {
        setStep({ kind: 'idle', error: `El archivo tiene más de ${MAX_ROWS} filas. Dividilo en partes más chicas.` })
        return
      }
      const lookups: MovementRowLookups = {
        categoryIdByKindAndName: new Map(
          categories.data.map((c) => [`${c.kind}::${c.name.toLowerCase()}`, c.id]),
        ),
        accountIdByName: new Map(accounts.data.map((a) => [a.name.toLowerCase(), a.id])),
        defaultAccountId: accounts.data[0]?.id ?? null,
      }
      const parsed = parseMovementRows(dataRows, lookups)
      if (parsed.rows.length === 0 && parsed.issues.length === 0) {
        setStep({ kind: 'idle', error: 'No encontramos filas con datos en ese archivo.' })
        return
      }
      setStep({ kind: 'preview', parsed })
    } catch (e) {
      setStep({ kind: 'idle', error: toUserMessage(e) })
    }
  }

  async function handleConfirm(parsed: ParsedMovementsWorkbook) {
    setStep({ kind: 'importing', parsed })
    const results = await importTransactions.mutateAsync(
      parsed.rows.map((row, index) => ({
        key: String(index),
        values: {
          accountId: row.accountId,
          categoryId: row.categoryId,
          kind: row.kind,
          amountCents: row.amountCents,
          occurredOn: row.occurredOn,
          note: row.note,
        },
      })),
    )
    const imported = results.filter((r) => r.ok).length
    setStep({ kind: 'done', imported, failed: results.length - imported })
  }

  return (
    <BottomSheet title="Importar desde Excel" onClose={onClose}>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void handlePick(file)
        }}
      />

      {step.kind === 'idle' && (
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-[14px] text-text-muted">
            Usá el mismo formato de "Exportar movimientos": columnas Fecha, Tipo (Gasto o Ingreso), Monto, Categoría,
            Cuenta y Nota. La categoría tiene que existir en Moni con ese nombre exacto. Antes de traer nada, te
            mostramos una vista previa.
          </p>
          {step.error && <p className="text-[13px] text-expense">{step.error}</p>}
          <Button onClick={() => fileRef.current?.click()}>Elegir archivo .xlsx</Button>
        </div>
      )}

      {step.kind === 'preview' && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-col gap-1 text-[14px]">
            <p>
              <strong>{step.parsed.rows.length}</strong> movimientos listos para importar.
            </p>
            {step.parsed.issues.length > 0 && (
              <p className="text-expense">{step.parsed.issues.length} filas no se pueden importar.</p>
            )}
          </div>
          {step.parsed.issues.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-[16px] bg-sand/60 p-3 text-[12.5px] text-text-muted">
              {step.parsed.issues.slice(0, 20).map((issue) => (
                <li key={issue.rowNumber}>
                  Fila {issue.rowNumber}: {issue.reason}
                </li>
              ))}
              {step.parsed.issues.length > 20 && <li>…y {step.parsed.issues.length - 20} más.</li>}
            </ul>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep({ kind: 'idle', error: null })}>
              Cancelar
            </Button>
            <Button disabled={step.parsed.rows.length === 0} onClick={() => void handleConfirm(step.parsed)}>
              Importar {step.parsed.rows.length > 0 ? step.parsed.rows.length : ''}
            </Button>
          </div>
        </div>
      )}

      {step.kind === 'importing' && <p className="py-4 text-center text-[14px] text-text-muted">Importando…</p>}

      {step.kind === 'done' && (
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-[14px]">
            Se importaron <strong>{step.imported}</strong> movimientos.
            {step.failed > 0 && ` ${step.failed} no se pudieron guardar.`}
          </p>
          <Button
            onClick={() => {
              toast.show('Importación terminada')
              onClose()
            }}
          >
            Listo
          </Button>
        </div>
      )}
    </BottomSheet>
  )
}

/** Importing from Excel is Moni Plus: a Free person who gets here any other way sees the promo, never the importer. (Exporting stays free.) */
export function ImportMovementsSheet({ onClose }: ImportMovementsSheetProps) {
  const { isFree } = usePlus()
  if (isFree) return <PlusPromoDialog feature="excel_import" onClose={onClose} />
  return <ImportMovementsCapture onClose={onClose} />
}
