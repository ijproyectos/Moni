import { render, screen } from '@testing-library/react'
import { FEATURES } from '@/shared/config/features'
import { AddPersonSheet } from './AddPersonSheet'

function renderSheet() {
  render(<AddPersonSheet code="ABC123" groupName="Viaje" onClose={vi.fn()} onAddGuest={vi.fn()} />)
}

describe('AddPersonSheet', () => {
  it('only offers real members (invite code); no people without Moni while the flag is off', () => {
    renderSheet()
    expect(screen.getByText('Tiene Moni')).toBeInTheDocument()
    expect(screen.queryByText('No tiene Moni')).toBeNull()
  })

  it('offers people without Moni when the flag is on', () => {
    FEATURES.groupGuestsAndSimulatedSplits = true
    try {
      renderSheet()
      expect(screen.getByText('No tiene Moni')).toBeInTheDocument()
    } finally {
      FEATURES.groupGuestsAndSimulatedSplits = false
    }
  })
})
