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
