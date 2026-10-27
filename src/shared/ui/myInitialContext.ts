import { createContext, useContext } from 'react'

/** Initial shown in avatars labelled "Vos" (the signed-in person). */
export const MyInitialContext = createContext<string>('V')

export function useMyInitial(): string {
  return useContext(MyInitialContext)
}
