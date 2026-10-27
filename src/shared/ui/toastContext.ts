import { createContext, useContext } from 'react'

export interface ToastOptions {
  tone?: 'success' | 'error'
  /** Mascot image URL shown next to the message. */
  mascotUrl?: string
}

export interface ToastApi {
  show: (message: string, options?: ToastOptions) => void
}

export const ToastContext = createContext<ToastApi>({ show: () => undefined })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
