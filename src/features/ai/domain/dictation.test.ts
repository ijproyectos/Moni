import { joinResults, mergeDictation } from './dictation'

describe('joinResults', () => {
  it('joins finished phrases and the one still being heard', () => {
    expect(joinResults(['gasté quinientos', 'en el super'])).toBe('gasté quinientos en el super')
  })

  it('does not repeat words when each result already contains the previous ones (Android)', () => {
    expect(joinResults(['gasté', 'gasté quinientos', 'gasté quinientos en el super'])).toBe('gasté quinientos en el super')
  })

  it('skips a result that repeats the end of what was said', () => {
    expect(joinResults(['gasté quinientos en el super', 'en el super'])).toBe('gasté quinientos en el super')
  })

  it('ignores empty results and extra spaces', () => {
    expect(joinResults(['', '  hola   que  tal ', ' '])).toBe('hola que tal')
  })
})

describe('mergeDictation', () => {
  it('goes after what was already written, with one space', () => {
    expect(mergeDictation('Gasté $500 en', 'el supermercado')).toBe('Gasté $500 en el supermercado')
    expect(mergeDictation('Gasté $500 en   ', 'el supermercado')).toBe('Gasté $500 en el supermercado')
  })

  it('without written text it is just what was heard', () => {
    expect(mergeDictation('', 'hola')).toBe('hola')
  })

  it('hearing nothing leaves the text exactly as it was', () => {
    expect(mergeDictation('Gasté $500 en ', '')).toBe('Gasté $500 en ')
  })
})
