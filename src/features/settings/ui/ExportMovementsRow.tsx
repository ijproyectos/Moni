import { useState } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useCategories } from '@/features/categories/api/useCategories'
import { useTransactions } from '@/features/transactions/api/useTransactions'
import { downloadFile, shareFile } from '@/shared/lib/share'
import { todayIso } from '@/shared/lib/month'
import { SettingRow } from '@/shared/ui/SettingRow'
import { useToast } from '@/shared/ui/toastContext'
import { buildMovementRows, MOVEMENT_SHEET_NAME } from '../domain/movementsWorkbook'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** "Exportar movimientos": every posted movement as an .xlsx (shared via the device's share sheet, or downloaded). */
export function ExportMovementsRow() {
  const toast = useToast()
  const transactions = useTransactions({})
  const categories = useCategories()
  const accounts = useAccounts({ includeArchived: true })
  const [isExporting, setIsExporting] = useState(false)

  const ready = Boolean(transactions.data && categories.data && accounts.data)

  async function handleExport() {
    if (!transactions.data || !categories.data || !accounts.data) return
    setIsExporting(true)
    try {
      const categoryNameById = new Map(categories.data.map((c) => [c.id, c.name]))
      const accountNameById = new Map(accounts.data.map((a) => [a.id, a.name]))
      const sheetRows = buildMovementRows(transactions.data, categoryNameById, accountNameById)

      // Loaded on demand: exceljs is heavy and most people never export, so it should not bloat the main bundle.
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet(MOVEMENT_SHEET_NAME)
      sheetRows.forEach((row) => sheet.addRow(row))
      sheet.getRow(1).font = { bold: true }
      sheet.columns.forEach((column) => {
        column.width = 18
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: XLSX_TYPE })
      const filename = `moni-movimientos-${todayIso()}.xlsx`
      const file = new File([blob], filename, { type: XLSX_TYPE })

      const shared = await shareFile(file, 'Movimientos de Moni')
      if (!shared) downloadFile(blob, filename)
      toast.show('Exportación lista')
    } catch {
      toast.show('No pudimos exportar tus movimientos. Probá de nuevo.', { tone: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <SettingRow
      title="Exportar movimientos"
      subtitle={isExporting ? 'Generando el archivo…' : 'Descargá todo en un Excel (.xlsx)'}
      onClick={ready && !isExporting ? handleExport : undefined}
    />
  )
}
