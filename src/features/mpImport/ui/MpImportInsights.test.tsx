import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MpDuplicates, MpSuggestions } from './MpImportInsights'

describe('MpDuplicates', () => {
  const rows = [
    { paymentId: 'p1', occurredOn: '2026-05-10', duplicateOccurredOn: '2026-05-11', cents: 80000 },
  ]

  it('renders nothing without duplicates', () => {
    const { container } = render(<MpDuplicates items={[]} offline={false} onDismiss={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each possible duplicate and dismisses it by payment id', async () => {
    const onDismiss = vi.fn()
    render(<MpDuplicates items={rows} offline={false} onDismiss={onDismiss} />)
    expect(screen.getByText(/\$800/)).toBeInTheDocument()
    expect(screen.getByText(/10\/05/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /No es duplicado/ }))
    expect(onDismiss).toHaveBeenCalledWith('p1')
  })

  it('disables dismiss offline', () => {
    render(<MpDuplicates items={rows} offline onDismiss={vi.fn()} />)
    expect(screen.getByRole('button', { name: /No es duplicado/ })).toBeDisabled()
  })
})

describe('MpSuggestions', () => {
  it('renders nothing without suggestions', () => {
    const { container } = render(<MpSuggestions items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says the payment was not loaded as an expense and names the subscription', () => {
    render(
      <MpSuggestions
        items={[
          {
            paymentId: 'p1',
            merchant: 'NETFLIX',
            occurredOn: '2026-03-10',
            cents: 500000,
            subscriptionName: 'Netflix',
          },
          {
            paymentId: 'p2',
            merchant: null,
            occurredOn: '2026-03-11',
            cents: 10000,
            subscriptionName: null,
          },
        ]}
      />,
    )
    expect(screen.getByText(/Netflix/)).toBeInTheDocument()
    expect(screen.getByText(/\$5\.000/)).toBeInTheDocument()
    expect(screen.getAllByText(/no lo cargamos como gasto/i)).toHaveLength(2)
  })
})
