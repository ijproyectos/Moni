import { looksLikeMovement } from './talkIntent'

describe('looksLikeMovement', () => {
  it.each(['Gasté $18.000 en el chino', 'cobré 20 mil de un freelance', 'Pagué 5000 de luz', 'Me pagaron 120 lucas'])(
    '"%s" is a movement',
    (text) => expect(looksLikeMovement(text)).toBe(true),
  )
  it.each(['¿Cuánto tengo?', 'Cómo voy este mes', 'cuánto gasté en comida?', 'hola', '', 'Gasté mucho'])(
    '"%s" is not',
    (text) => expect(looksLikeMovement(text)).toBe(false),
  )
})
