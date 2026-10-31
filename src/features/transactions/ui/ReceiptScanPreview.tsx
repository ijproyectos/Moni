import { useEffect, useState } from 'react'
import mascotAttentive from '@/assets/mascot/expresion_atento.svg'

/** Local preview URL of the chosen photo; null while there is none or when the browser cannot make one. */
function usePreviewUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setUrl(null)
      return
    }
    const created = URL.createObjectURL(file)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [file])
  return url
}

/**
 * What the person sees while the receipt is being read: their own photo with a light bar sweeping over it and an
 * "Analizando…" label. Without a photo to show it keeps Moni's face. The sweep is decoration (it stops with reduced
 * motion, see `.receipt-sweep`); the sheet's status line is what screen readers announce.
 */
export function ReceiptScanPreview({ file }: { file: File | null }) {
  const url = usePreviewUrl(file)
  return (
    <div className="relative flex w-full flex-col items-center">
      {url ? (
        <div className="relative max-h-72 w-full overflow-hidden rounded-[20px] bg-sand">
          <img
            src={url}
            alt="Foto de tu factura"
            className="mx-auto max-h-72 w-full object-contain"
          />
          <div
            data-testid="receipt-scan-sweep"
            aria-hidden="true"
            className="receipt-sweep pointer-events-none absolute inset-x-0 top-0 h-1/3"
          />
        </div>
      ) : (
        <img src={mascotAttentive} alt="" className="size-28 motion-safe:animate-pulse" />
      )}
      <span
        aria-hidden="true"
        className="mt-3 rounded-full bg-forest px-4 py-1 font-display text-[15px] font-extrabold text-cream"
      >
        Analizando…
      </span>
    </div>
  )
}
