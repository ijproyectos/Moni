import type { ToastApi } from '@/shared/ui/toastContext'

/** Copies text and confirms with a toast. Returns whether it worked. */
export async function copyText(
  text: string,
  toast: ToastApi,
  message = 'Copiado',
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    toast.show(message)
    return true
  } catch {
    toast.show('No pudimos copiar. Seleccionalo a mano.', { tone: 'error' })
    return false
  }
}

/** Opens the native share sheet when available; otherwise copies the link. */
export async function shareLink(
  { url, text, title = 'Moni' }: { url: string; text: string; title?: string },
  toast: ToastApi,
): Promise<void> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url })
    } catch {
      // Closed the share dialog.
    }
    return
  }
  await copyText(url, toast, 'Link copiado')
}

/** Opens WhatsApp with a prefilled message. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
