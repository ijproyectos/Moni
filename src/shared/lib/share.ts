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

/**
 * Opens the device's share menu with some text (WhatsApp, messages, mail…). Where there is none (most desktops) it
 * opens WhatsApp with the text ready to send. Closing the menu is not an error.
 */
export async function shareText(text: string, title = 'Moni'): Promise<void> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
    } catch {
      // Closed the share dialog.
    }
    return
  }
  window.open(whatsappUrl(text), '_blank', 'noopener,noreferrer')
}

/** Shares a file through the device's share menu; false when the device cannot share files. */
export async function shareFile(file: File, title = 'Moni'): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  if (!navigator.canShare({ files: [file] })) return false
  try {
    await navigator.share({ title, files: [file] })
  } catch {
    // Closed the share dialog.
  }
  return true
}

/** Saves a file with the browser's download. */
export function downloadFile(file: Blob, filename: string): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
