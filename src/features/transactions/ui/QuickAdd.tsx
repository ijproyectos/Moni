import { Camera, Mic, Pencil } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useParseReceipt } from '@/features/ai/api/useParseReceipt'
import { usePlus } from '@/features/plus/api/usePlus'
import type { PlusFeature } from '@/features/plus/domain/entitlements'
import { PlusPromoDialog } from '@/features/plus/ui/PlusPromoDialog'
import { PlusTag } from '@/features/plus/ui/PlusTag'
import { useMovementSheet } from './movementSheetContext'
import { ReceiptScan } from './ReceiptScan'
import { VoiceSheet } from './VoiceSheet'

/**
 * Inicio's three ways to load a movement, as round buttons: "Foto" (receipt scan), "Manual" (the form) and "Voz" (dictate
 * it). Free plan: photo and voice open the Plus upsell. Moni Agent, the chat, is a separate floating cat.
 */
export function QuickAdd() {
  const { openNew } = useMovementSheet()
  const [voiceOpen, setVoiceOpen] = useState(false)
  // Remount the voice screen per opening so its state starts clean.
  const [voiceCount, setVoiceCount] = useState(0)
  const [receiptOpen, setReceiptOpen] = useState(false)
  /** The photo being read: the analyzing screen shows it under the scan sweep. */
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  // Free plan: voice and photo open the Plus upsell instead (the server enforces it too).
  const { isFree } = usePlus()
  const [upsell, setUpsell] = useState<PlusFeature | null>(null)
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
    setReceiptFile(file)
    setReceiptOpen(true)
    scanReceipt(file)
  }

  function onPhoto() {
    if (isFree) setUpsell('photo')
    else openPicker()
  }

  function onVoice() {
    if (isFree) {
      setUpsell('voice')
      return
    }
    setVoiceCount((n) => n + 1)
    setVoiceOpen(true)
  }

  function onManual() {
    openNew()
  }

  return (
    <>
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
      <section aria-label="Cargar un movimiento" className="flex items-start justify-center gap-7 px-[18px]">
        <CaptureButton label="Foto" onClick={onPhoto} tag primary icon={<Camera aria-hidden="true" className="size-[22px]" strokeWidth={2.2} />} />
        <CaptureButton label="Manual" onClick={onManual} icon={<Pencil aria-hidden="true" className="size-5" strokeWidth={2.2} />} />
        <CaptureButton label="Voz" onClick={onVoice} tag icon={<Mic aria-hidden="true" className="size-[22px]" strokeWidth={2.2} />} />
      </section>
      {upsell && <PlusPromoDialog feature={upsell} onClose={() => setUpsell(null)} />}
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

function CaptureButton({
  label,
  icon,
  onClick,
  primary = false,
  tag = false,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  primary?: boolean
  /** Shows the small PLUS label over the button (Free people only). */
  tag?: boolean
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-16 flex-col items-center gap-1.5 outline-none">
      <span className="relative">
      <span
        className={`flex size-[60px] items-center justify-center rounded-full border motion-safe:transition motion-safe:active:scale-[0.97] ${
          primary
            ? 'border-transparent bg-[#1B3A2E] text-[#F1EEDD] dark:bg-[#F1EEDD] dark:text-[#0E1A13]'
            : 'border-[#DCD8BF] bg-[#FAF8EC] text-[#0C2418] dark:border-[#2c4437] dark:bg-[#16261C] dark:text-[#F1EEDD]'
        }`}
      >
        {icon}
      </span>
      {tag && <PlusTag className="absolute -right-2 -top-1.5" />}
      </span>
      <span className="text-[13px] font-bold text-[#0C2418] dark:text-[#F1EEDD]">{label}</span>
    </button>
  )
}
