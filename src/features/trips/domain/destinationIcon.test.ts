import { describe, expect, it } from 'vitest'
import { destinationTheme } from './destinationIcon'

describe('destinationTheme', () => {
  it.each([
    ['Portugal', 'sea'],
    ['Bariloche', 'mountain'],
    ['Cancún', 'palm'],
    ['Miami', 'beach'],
    ['París', 'eiffel'],
    ['Nueva York', 'city'],
    ['Río de Janeiro', 'beach'],
    ['Ushuaia', 'snow'],
    ['Semana de esquí', 'snow'],
    ['Verano en la playa', 'beach'],
    ['Roma, Italia', 'landmark'],
  ])('%s -> %s', (name, theme) => {
    expect(destinationTheme(name)).toBe(theme)
  })

  it('uses a plane when nothing is recognised', () => {
    expect(destinationTheme('Lo de la abuela')).toBe('plane')
    expect(destinationTheme('')).toBe('plane')
  })
})

describe('manual icon', () => {
  it('only accepts looks the app knows and offers the eight of the picker', async () => {
    const { asTheme, PICKABLE_THEMES } = await import('./destinationIcon')
    expect(asTheme('beach')).toBe('beach')
    expect(asTheme('nature')).toBe('nature')
    expect(asTheme('rocket')).toBeUndefined()
    expect(asTheme(null)).toBeUndefined()
    expect(PICKABLE_THEMES.map((o) => o.label)).toEqual(['Playa', 'Montaña', 'Nieve', 'Sol', 'Ciudad', 'Naturaleza', 'Monumentos', 'Genérico'])
  })
})
