import { Camera, Mic, Plus as PlusIcon } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { useParseReceipt } from '@/features/ai/api/useParseReceipt'
import { usePlus } from '@/features/plus/api/usePlus'
import type { PlusGateReason } from '@/features/plus/domain/plus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { Fab } from '@/shared/ui/Fab'
import { SpeedDial, type SpeedDialItem } from '@/shared/ui/SpeedDial'
import { useMovementSheet } from './movementSheetContext'
import { ReceiptScan } from './ReceiptScan'
import { VoiceScreen } from './VoiceScreen'

/**
 * The global "+" button. Tapping it opens a speed-dial with three ways to add a movement:
 * "Sacar foto" (receipt scan), "Por voz" (dictation / typing) and "Manual" (the usual sheet).
 * Other entry points (Inicio, Cuentas, Actividad) keep calling `useMovementSheet().openNew` directly.
 */
export function QuickAdd() {
  const { openNew } = useMovementSheet()
  const online = useOnlineStatus()
  const [menuOpen, setMenuOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  // Free plan: voice and photo open the Plus upsell instead (the server enforces it too).
  const { isFree } = usePlus()
  const [upsell, setUpsell] = useState<PlusGateReason | null>(null)
  // Remount the voice screen per opening so its state starts clean.
  const [voiceCount, setVoiceCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const scan = useParseReceipt()
  const { mutate: scanReceipt } = scan

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

  const items: SpeedDialItem[] = [
    {
      id: 'photo',
      label: 'Sacar foto',
      icon: Camera,
      toneClassName: 'bg-[#d9c8f5]',
      disabled: !online,
      badge: isFree ? 'Plus' : undefined,
      onSelect: () => (isFree ? setUpsell('receipt') : openPicker()),
    },
    {
      id: 'voice',
      label: 'Por voz',
      icon: Mic,
      toneClassName: 'bg-lacquer',
      disabled: !online,
      badge: isFree ? 'Plus' : undefined,
      onSelect: () => {
        if (isFree) return setUpsell('voice')
        setVoiceCount((n) => n + 1)
        setVoiceOpen(true)
      },
    },
    {
      id: 'manual',
      label: 'Manual',
      icon: PlusIcon,
      toneClassName: 'bg-lime',
      // Stays enabled offline: the sheet shows its own offline notice and blocks saving, as before.
      onSelect: () => openNew(),
    },
  ]

  return (
    <>
      <Fab
        aria-label="Nuevo movimiento"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
      />
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
      {menuOpen && (
        <SpeedDial
          label="Agregar movimiento"
          items={items}
          note={online ? undefined : OFFLINE_MESSAGE}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {upsell && <PlusSheet reason={upsell} onClose={() => setUpsell(null)} />}
      {voiceOpen && <VoiceScreen key={voiceCount} onClose={() => setVoiceOpen(false)} />}
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
