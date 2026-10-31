// Test-only fixtures (UNVERIFIED MP payment shape, see mpFields.ts).

export const rawPayment = (over: Record<string, unknown> = {}) => ({
  id: 1001,
  status: 'approved',
  operation_type: 'regular_payment',
  currency_id: 'ARS',
  transaction_amount: 1500.5,
  date_approved: '2026-11-10T15:00:00.000-03:00',
  date_created: '2026-11-10T14:59:00.000-03:00',
  description: '  Cafe   Martinez ',
  payer: { id: 111, email: 'secret@example.com' },
  collector: { id: 222 },
  point_of_interaction: { type: 'PIX' },
  ...over,
})
