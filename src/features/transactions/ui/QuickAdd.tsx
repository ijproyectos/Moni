import { Camera, Mic, Plus } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { useParseReceipt } from '@/features/ai/api/useParseReceipt'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { AddActionMenu, type AddAction } from '@/shared/ui/AddActionMenu'
import { MoniAddButton } from '@/shared/ui/MoniAddButton'
import { useMovementSheet } from './movementSheetContext'
import { ReceiptScan } from './ReceiptScan'
import { VoiceSheet } from './VoiceSheet'

/**
 * The global add button: Moni's cat in the middle of the bottom bar. Tapping it opens a floating menu with three ways to
 * add a movement: "Sacar foto" (receipt scan), "Por voz" (dictation / typing) and "Manual" (the usual sheet).
 * Other entry points (Inicio, Cuentas, Actividad) keep calling `useMovementSheet().openNew` directly.
 */
export function QuickAdd() {
  const { openNew } = useMovementSheet()
  const online = useOnlineStatus()
  const [menuOpen, setMenuOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  // Remount the voice screen per opening so its state starts clean.
  const [voiceCount, setVoiceCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const scan = useParseReceipt()
  const { mutate: scanReceipt } = scan

  function closeMenu() {
    setMenuOpen(false)
  }

  /** Escape or a tap outside: close and give the focus back to the cat. */
  function dismissMenu() {
    closeMenu()
    buttonRef.current?.focus()
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
    setReceiptOpen(true)
    scanReceipt(file)
  }

  const actions: AddAction[] = [
    {
      id: 'photo',
      label: 'Sacar foto',
      icon: Camera,
      circle: 'bg-[#8a6bd1]',
      disabled: !online,
      onSelect: () => {
        closeMenu()
        openPicker()
      },
    },
    {
      id: 'voice',
      label: 'Por voz',
      icon: Mic,
      circle: 'bg-expense',
      disabled: !online,
      onSelect: () => {
        closeMenu()
        setVoiceCount((n) => n + 1)
        setVoiceOpen(true)
      },
    },
    {
      id: 'manual',
      label: 'Manual',
      icon: Plus,
      circle: 'bg-forest',
      // Stays enabled offline: the sheet shows its own offline notice and blocks saving, as before.
      onSelect: () => {
        closeMenu()
        openNew()
      },
    },
  ]

  return (
    <>
      {menuOpen && (
        <div
          aria-hidden="true"
          data-testid="add-menu-backdrop"
          onClick={dismissMenu}
          className="pointer-events-auto fixed inset-0 -z-10 bg-forest/55 backdrop-blur-[3px] motion-safe:animate-[fade-in_180ms_ease-out]"
        />
      )}
      {menuOpen && (
        <AddActionMenu
          actions={actions}
          note={online ? undefined : OFFLINE_MESSAGE}
          onClose={dismissMenu}
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
        aria-label={menuOpen ? 'Cerrar menú de movimientos' : 'Nuevo movimiento'}
        open={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      />
      {voiceOpen && <VoiceSheet key={voiceCount} onClose={() => setVoiceOpen(false)} />}
      {receiptOpen && (
        <ReceiptScan
          scan={scan}
          onRetry={openPicker}
          onClose={() => {
            scan.cancel()
            setReceiptOpen(false)
          }}
        />
      )}
    </>
  )
}
