import { createContext, useContext } from 'react'

export interface HiddenAmountsState {
  hidden: boolean
  toggle: () => void
}

export const HiddenAmountsContext = createContext<HiddenAmountsState>({
  hidden: false,
  toggle: () => undefined,
})

export function useHiddenAmounts(): HiddenAmountsState {
  return useContext(HiddenAmountsContext)
}
