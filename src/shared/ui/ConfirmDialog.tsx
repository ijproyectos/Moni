import { BottomSheet } from './BottomSheet'
import { Button } from './Button'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  isBusy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  isBusy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <BottomSheet title={title} onClose={onCancel}>
      <p className="mb-5 text-[16px] leading-6 text-text-muted">{message}</p>
      <div className="flex flex-col gap-2">
        <Button variant="dark" onClick={onConfirm} disabled={isBusy}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} className="text-ink" data-autofocus>
          {cancelLabel}
        </Button>
      </div>
    </BottomSheet>
  )
}
