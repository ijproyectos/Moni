import { render, screen } from '@testing-library/react'
import { settlementPhrase } from '../domain/phrases'
import { PhraseText } from './PhraseText'

const ME = 'u-me'
const me = { id: ME, name: 'Vos' }
const jonatan = { id: 'u-jon', name: 'Jonatan' }

function show(from: typeof me, to: typeof me) {
  render(
    <p data-testid="line">
      <PhraseText segments={settlementPhrase(from, to, ME)} />
    </p>,
  )
  return screen.getByTestId('line')
}

describe('PhraseText', () => {
  it('"Le pagaste a Jonatan" with only the name in bold', () => {
    const line = show(me, jonatan)
    expect(line).toHaveTextContent('Le pagaste a Jonatan')
    expect(line.querySelector('strong')).toHaveTextContent('Jonatan')
  })

  it('"Jonatan te pagó" when the signed-in person received the payment', () => {
    const line = show(jonatan, me)
    expect(line).toHaveTextContent('Jonatan te pagó')
    expect(line.querySelectorAll('strong')).toHaveLength(1)
  })
})
