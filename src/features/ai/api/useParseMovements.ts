import { useMutation } from '@tanstack/react-query'
import { todayIso } from '@/shared/lib/month'
import { parseMovements } from './aiRepository'

/** Turns free text into a draft list. Pure query: it does not touch the user's data. */
export function useParseMovements() {
  return useMutation({
    mutationFn: (text: string) => parseMovements(text, todayIso()),
  })
}
