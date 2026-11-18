import { Camera, Pencil } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import catFace from '@/assets/mascot/expresion_feliz.svg'
import { AssistantSheet } from '@/features/assistant/ui/AssistantSheet'
import { useParseReceipt } from '@/features/ai/api/useParseReceipt'
import { usePlus } from '@/features/plus/api/usePlus'
import type { PlusGateReason } from '@/features/plus/domain/plus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { useMovementSheet } from './movementSheetContext'
import { ReceiptScan } from './ReceiptScan'

/**
 * Inicio's capture block: "Hablá con Moni" (the cat opens the one chat: questions about the money and movements told in
 * plain words, confirmed before saving), "Foto" (receipt scan) and "Manual" (the form). Free plan: photo opens the Plus upsell.
 */
export function QuickAdd({ name = null }: { name?: string | null }) {
  const { openNew } = useMovementSheet()
  const [talkOpen, setTalkOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  /** The photo being read: the analyzing screen shows it under the scan sweep. */
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  // Free plan: voice and photo open the Plus upsell instead (the server enforces it too).
  const { isFree } = usePlus()
  const [upsell, setUpsell] = useState<PlusGateReason | null>(null)
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
    if (isFree) setUpsell('receipt')
    else openPicker()
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
      <section aria-label="Hablá con Moni" className="flex flex-col items-center gap-3 px-[18px]">
        <div className="flex flex-col items-center">
          <span className="relative rounded-full border border-[#DCD8BF] bg-[#FAF8EC] px-4 py-2.5 font-display text-[15px] font-extrabold text-[#0C2418] shadow-[0_6px_18px_rgba(17,34,24,0.10)] dark:border-[#2c4437] dark:bg-[#16261C] dark:text-[#F1EEDD]">
            Hablá con Moni
            <span
              aria-hidden="true"
              className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-[#DCD8BF] bg-[#FAF8EC] dark:border-[#2c4437] dark:bg-[#16261C]"
            />
          </span>
          <button
            type="button"
            onClick={() => setTalkOpen(true)}
            aria-label="Hablá con Moni"
            aria-haspopup="dialog"
            className="mt-3 flex size-[88px] items-center justify-center rounded-full border-[3px] border-[#A99BE3] bg-[#1B3A2E] shadow-[0_10px_28px_rgba(17,34,24,0.25)] outline-none motion-safe:transition motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] dark:focus-visible:outline-[#F1EEDD]"
          >
            <img src={catFace} alt="" className="size-[68px] object-contain" />
          </button>
        </div>
        <div className="flex items-start justify-center gap-8">
          <CaptureButton label="Foto" onClick={onPhoto} primary icon={<Camera aria-hidden="true" className="size-6" strokeWidth={2.2} />} />
          <CaptureButton label="Manual" onClick={onManual} icon={<Pencil aria-hidden="true" className="size-[22px]" strokeWidth={2.2} />} />
        </div>
      </section>
      {upsell && <PlusSheet reason={upsell} onClose={() => setUpsell(null)} />}
      {talkOpen && <AssistantSheet name={name} onClose={() => setTalkOpen(false)} />}
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
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-16 flex-col items-center gap-1.5 outline-none">
      <span
        className={`flex size-[60px] items-center justify-center rounded-full border motion-safe:transition motion-safe:active:scale-[0.97] ${
          primary
            ? 'border-transparent bg-[#1B3A2E] text-[#F1EEDD] dark:bg-[#F1EEDD] dark:text-[#0E1A13]'
            : 'border-[#DCD8BF] bg-[#FAF8EC] text-[#0C2418] dark:border-[#2c4437] dark:bg-[#16261C] dark:text-[#F1EEDD]'
        }`}
      >
        {icon}
      </span>
      <span className="text-[13px] font-bold text-[#0C2418] dark:text-[#F1EEDD]">{label}</span>
    </button>
  )
}
