import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { todayIso } from '@/shared/lib/month'
import { AiError, parseReceipt } from './aiRepository'
import { DownscaleError, downscaleImage } from '../domain/imageDownscale'

/**
 * Photo -> downscale in the browser -> parse-receipt -> single-expense draft. Pure query: it does not touch the
 * person's data. `cancel()` aborts the request and resets the mutation (the day's quota use is already spent).
 */
export function useParseReceipt() {
  const controllerRef = useRef<AbortController | null>(null)
  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const controller = new AbortController()
      controllerRef.current = controller
      let image
      try {
        image = await downscaleImage(file)
      } catch (error) {
        if (error instanceof DownscaleError) {
          throw new AiError(error.code === 'too_large' ? 'image_too_large' : 'image_not_readable')
        }
        throw error
      }
      if (controller.signal.aborted) throw new AiError('cancelled')
      return parseReceipt(image, todayIso(), controller.signal)
    },
  })
  const { reset } = mutation

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    reset()
  }, [reset])

  // Leaving the screen mid-request must not leave the call (and its result) dangling.
  useEffect(() => () => controllerRef.current?.abort(), [])

  return { ...mutation, cancel }
}
