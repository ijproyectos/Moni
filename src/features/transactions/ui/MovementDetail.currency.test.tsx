import { render, screen } from '@testing-library/react'
import { makeTransaction } from '../domain/testing'
import { MovementDetail } from './MovementDetail'

function renderDetail(overrides = {}) {
  render(
    <MovementDetail
      transaction={makeTransaction(overrides)}
      category={undefined}
      accountName={undefined}
      history={[]}
      onClose={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
    />,
  )
}

describe('MovementDetail currency line', () => {
  it('shows the USD figure and the rate for a dollar movement', () => {
    renderDetail({
      amountCents: 2_700_000,
      originalAmountCents: 2000,
      originalCurrency: 'USD',
      fxRate: 1350,
    })
    expect(screen.getByText(/dólar tarjeta/)).toHaveTextContent('US$ 20 · dólar tarjeta $1.350')
  })

  it('shows nothing extra for a peso movement', () => {
    renderDetail()
    expect(screen.queryByText(/dólar tarjeta/)).not.toBeInTheDocument()
  })
})
