import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { InstallmentSimulatorPage } from './InstallmentSimulatorPage'

function setup() {
  render(
    <MemoryRouter>
      <InstallmentSimulatorPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('InstallmentSimulatorPage', () => {
  it('asks for the prices before comparing', () => {
    setup()
    expect(screen.getByText(/Cargá el precio de contado/)).toBeInTheDocument()
  })

  it('compares with the typed numbers and the editable inflation', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Precio contado'), '1200000')
    await user.type(screen.getByLabelText('Descuento en porcentaje'), '10')
    const total = screen.getByLabelText('Precio en cuotas')
    await user.clear(total)
    await user.type(total, '1380000')
    await user.click(screen.getByRole('button', { name: '6' }))
    const result = screen.getByRole('region', { name: 'Resultado' })
    expect(result).toHaveTextContent('Contado con 10% off')
    expect(result).toHaveTextContent('$1.080.000')
    expect(result).toHaveTextContent('6 cuotas')
    expect(result).toHaveTextContent('$1.266.869')
    expect(screen.getByRole('status')).toHaveTextContent('Conviene contado')
    expect(screen.getByRole('status')).toHaveTextContent('Ahorrás $186.869')
    expect(result).toHaveTextContent(/Las cuotas empiezan a convenir si la inflación supera [\d,]+% mensual/)
  })

  it('flips the recommendation when inflation is high', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Precio contado'), '1000000')
    const inflation = screen.getByLabelText('Inflación mensual en porcentaje')
    await user.clear(inflation)
    await user.type(inflation, '8')
    expect(screen.getByRole('status')).toHaveTextContent('Conviene en cuotas')
  })

  it('steps the inflation by half a point', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Subir la inflación' }))
    expect(screen.getByLabelText('Inflación mensual en porcentaje')).toHaveValue('3')
  })
})
