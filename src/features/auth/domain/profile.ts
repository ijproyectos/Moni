import { z } from 'zod'

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Ponete un nombre.')
  .max(60, 'Máximo 60 caracteres.')

export function firstName(displayName: string | null | undefined): string {
  return displayName?.trim().split(/\s+/)[0] ?? ''
}

export function initialOf(displayName: string | null | undefined, fallback = ''): string {
  return (displayName?.trim() || fallback.trim()).charAt(0).toUpperCase()
}
