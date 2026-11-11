import { useRef, useState, type ChangeEvent } from 'react'
import { useParseReceipt } from '@/features/ai/api/useParseReceipt'
import { usePlus } from '@/features/plus/api/usePlus'
import type { PlusGateReason } from '@/features/plus/domain/plus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { MoniAddButton } from '@/shared/ui/MoniAddButton'
import { useMovementSheet } from './movementSheetContext'
import { QuickAddSheet } from './QuickAddSheet'
import { ReceiptScan } from './ReceiptScan'
import type { RepeatSuggestion } from '../domain/recentRepeats'
import { VoiceSheet } from './VoiceSheet'

/**
 * The global add button: Moni's cat in the middle of the bottom bar. Tapping it opens the assistant sheet (screen 18)
 * with three ways to add a movement: "Foto" (receipt scan), "Voz" (dictation / typing) and "A mano" (the form), plus
 * "Repetir uno reciente" and "Dividir un gasto con un grupo".
 * Other entry points (Inicio, Cuentas, Actividad) keep calling `useMovementSheet().openNew` directly.
 */
export function QuickAdd() {
  const { openNew } = useMovementSheet()
  const online = useOnlineStatus()
  const [menuOpen, setMenuOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  /** The photo being read: the analyzing screen shows it under the scan sweep. */
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  // Free plan: voice and photo open the Plus upsell instead (the server enforces it too).
  const { isFree } = usePlus()
  const [upsell, setUpsell] = useState<PlusGateReason | null>(null)
  // Remount the voice screen per opening so its state starts clean.
  const [voiceCount, setVoiceCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const scan = useParseReceipt()
  const { mutate: scanReceipt } = scan

  function closeMenu() {
    setMenuOpen(false)
  }

  function openPicker() {
    const input = inputRef.current
    if (!input) return
    // Picking the same photo twice must still fire `change`.
    input.value = ''
    input.click()
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setReceiptFile(file)
    setReceiptOpen(true)
    scanReceipt(file)
  }

  function onPhoto() {
    closeMenu()
    if (isFree) setUpsell('receipt')
    else openPicker()
  }

  function onVoice() {
    closeMenu()
    if (isFree) return setUpsell('voice')
    setVoiceCount((n) => n + 1)
    setVoiceOpen(true)
  }

  function onManual() {
    closeMenu()
    openNew()
  }

  function onRepeat(suggestion: RepeatSuggestion) {
    closeMenu()
    openNew('expense', {
      initial: {
        amountCents: suggestion.amountCents,
        categoryId: suggestion.categoryId,
        accountId: suggestion.accountId,
        note: suggestion.note,
      },
    })
  }

  function onShare() {
    closeMenu()
    openNew('expense', { shared: true })
  }

  return (
    <>
      {menuOpen && (
        <QuickAddSheet
          online={online}
          plusBadge={isFree}
          onPhoto={onPhoto}
          onVoice={onVoice}
          onManual={onManual}
          onRepeat={onRepeat}
          onShare={onShare}
          onClose={closeMenu}
        />
      )}
      {/* Always mounted: the menu closes before the picker opens, and the click must stay in the same tap. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="receipt-input"
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
        onChange={onFileChosen}
      />
      <MoniAddButton
        ref={buttonRef}
        aria-label="Nuevo movimiento"
        open={menuOpen}
        onClick={() => setMenuOpen(true)}
      />
      {upsell && <PlusSheet reason={upsell} onClose={() => setUpsell(null)} />}
      {voiceOpen && <VoiceSheet key={voiceCount} onClose={() => setVoiceOpen(false)} />}
      {receiptOpen && (
        <ReceiptScan
          scan={scan}
          file={receiptFile}
          onRetry={openPicker}
          onClose={() => {
            scan.cancel()
            setReceiptOpen(false)
            setReceiptFile(null)
          }}
        />
      )}
    </>
  )
}
