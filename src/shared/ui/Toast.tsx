import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from './cn'
import { ToastContext, type ToastOptions } from './toastContext'

interface ActiveToast extends ToastOptions {
  id: number
  message: string
}

const DURATION_MS = 3500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null)
  const counter = useRef(0)

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    counter.current += 1
    setToast({ id: counter.current, message, ...options })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[60] mx-auto flex w-full max-w-[430px] justify-center px-4"
      >
        {toast && (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2 font-display text-base font-semibold shadow-lg motion-safe:animate-[fade-in_150ms_ease-out]',
              toast.tone === 'error' ? 'bg-blush text-forest' : 'bg-forest text-cream',
            )}
          >
            {toast.mascotUrl && (
              <img src={toast.mascotUrl} alt="" className="size-9 rounded-full bg-cream" />
            )}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
