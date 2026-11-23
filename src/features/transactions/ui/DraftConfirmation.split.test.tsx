import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DraftMovement } from '@/features/ai/domain/draft'
import { DraftConfirmation } from './DraftConfirmation'

vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a1', name: 'Banco', kind: 'bank', archivedAt: null, balanceCents: 0 }] }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({ data: [{ id: 'c1', name: 'Súper', kind: 'expense', color: '#000', icon: 'Tag', archivedAt: null }] }),
}))
vi.mock('@/features/dashboard/api/useDailyAllowance', () => ({
  useDailyAllowance: () => ({ allowance: { kind: 'sin-datos' } }),
}))
vi.mock('../api/useTransactions', () => ({
  useCreateTransactions: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/shared/lib/useOnlineStatus', () => ({ useOnlineStatus: () => true }))
vi.mock('./MovementConfirmCards', () => ({ MovementConfirmCards: () => <div>tarjetas</div> }))
vi.mock('./VoiceFrame', () => ({ VoiceFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
const shared = vi.hoisted(() => ({ draft: null as unknown }))
vi.mock('@/features/groups/ui/SharedMovementForm', () => ({
  SharedMovementForm: ({ draft }: { draft: unknown }) => {
    shared.draft = draft
    return <div>formulario de grupo</div>
  },
}))

const draft = (over: Partial<DraftMovement>): DraftMovement => ({
  key: 'd', kind: 'expense', amount: '1.500', note: 'Leche', categoryId: 'c1', accountId: 'a1', occurredOn: '2026-11-20', confidence: 1, accountUnmatched: false, ...over,
})

function setup(props: { allowGroupSplit?: boolean; drafts: DraftMovement[] }) {
  render(<DraftConfirmation initialDrafts={props.drafts} notice={null} allowGroupSplit={props.allowGroupSplit} onClose={vi.fn()} />)
  return userEvent.setup()
}

describe('Receipt photo: "Dividir con un grupo"', () => {
  it('is offered for a receipt and opens the group form with the whole ticket as ONE expense and the recognized items', async () => {
    const user = setup({ allowGroupSplit: true, drafts: [draft({ key: '1', amount: '1.500', note: 'Leche' }), draft({ key: '2', amount: '2.500', note: 'Pan' })] })
    const row = screen.getByRole('switch', { name: 'Dividir con un grupo' })
    expect(row).toHaveAttribute('aria-checked', 'false')
    await user.click(row)
    expect(screen.getByText('formulario de grupo')).toBeInTheDocument()
    expect(screen.queryByText('tarjetas')).toBeNull()
    expect(shared.draft).toEqual({ amount: '4.000', note: 'Leche, Pan', occurredOn: '2026-11-20', accountId: 'a1', categoryName: 'Súper' })
  })

  it('can be turned off again to save it as a personal expense', async () => {
    const user = setup({ allowGroupSplit: true, drafts: [draft({})] })
    await user.click(screen.getByRole('switch', { name: 'Dividir con un grupo' }))
    await user.click(screen.getByRole('switch', { name: 'Dividir con un grupo' }))
    expect(screen.getByText('tarjetas')).toBeInTheDocument()
  })

  it('is not offered in the voice and text flows, nor for incomes', () => {
    setup({ drafts: [draft({})] })
    expect(screen.queryByRole('switch', { name: 'Dividir con un grupo' })).toBeNull()
  })

  it('is not offered when the receipt has an income', () => {
    setup({ allowGroupSplit: true, drafts: [draft({ kind: 'income' })] })
    expect(screen.queryByRole('switch', { name: 'Dividir con un grupo' })).toBeNull()
  })
})
