import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlusFeature } from '../domain/entitlements'
import { PlusPromoDialog } from './PlusPromoDialog'
import { PlusTag } from './PlusTag'

const plus = vi.hoisted(() => ({ value: { isPlus: false, isFree: true } }))
vi.mock('../api/usePlus', () => ({ usePlus: () => plus.value }))
vi.mock('./PlusSheet', () => ({
  PlusSheet: ({ reason }: { reason: string }) => <div role="dialog" aria-label={`plans:${reason}`} />,
}))

const COPY: Record<PlusFeature, [string, string]> = {
  photo: ['Sacá una foto y yo me encargo', 'Con Moni Plus puedo leer tus tickets y cargar tus gastos automáticamente. ¡Ahorrá tiempo!'],
  voice: ['Contame qué gastaste', 'Decime cuánto gastaste y en qué. Con Moni Plus me encargo de registrarlo por vos'],
  assistant: ['Conocé a tu asistente financiero', 'Preguntame sobre tus ingresos, tus gastos o cuánto podés ahorrar. Con Moni Plus te ayudo a tomar mejores decisiones con tu plata'],
  groups: ['Compartí más momentos', 'Con Moni Plus podés crear todos los grupos que quieras y organizar tus gastos con amigos, familia o pareja'],
  reminders: ['Que ningún pago quede pendiente', 'Con Moni Plus podés enviar recordatorios de pago y organizar mejor tus gastos compartidos'],
  mercadopago: ['Tu plata, siempre al día', 'Vinculá tu cuenta de Mercado Pago y dejá que sincronice tus movimientos automáticamente con Moni Plus'],
  goals: ['Soñemos en grande', '¿Tenés más de un sueño por cumplir? Con Moni Plus podés crear todas las metas de ahorro que quieras'],
  health: ['Descubrí cómo están tus finanzas', 'Con Moni Plus puedo analizar tus hábitos financieros y ayudarte a descubrir qué estás haciendo bien y qué podés mejorar'],
  trips: ['Tu próxima aventura te espera', 'Organizá todos tus viajes, controlá tus presupuestos y disfrutá sin preocuparte tanto por los números'],
  recurring: ['Que ningún pago te sorprenda', 'Con Moni Plus te ayudo a organizar tus suscripciones, controlar tus gastos fijos y anticiparte a tus próximos pagos'],
  ants: ['Los pequeños gastos también cuentan', 'Te ayudo a descubrir esos pequeños gastos que, sin darte cuenta, pueden representar una gran parte de tu plata'],
  reports: ['Entendé mejor tus números', 'Con Moni Plus podés acceder a informes detallados, comparar tus gastos y conocer cómo evolucionan tus finanzas'],
  smart_notices: ['Dejá que yo te avise', 'Con Moni Plus puedo avisarte sobre próximos pagos, aumentos de precio y límites de gastos'],
  excel_import: ['Traé tus movimientos a Moni', 'Con Moni Plus podés importar tus movimientos desde Excel sin tener que cargarlos uno por uno'],
}

describe('PlusPromoDialog', () => {
  it.each(Object.entries(COPY))('%s: its own title and first-person text, Moni, the MONI PLUS label and both buttons', (feature, [title, text]) => {
    render(<PlusPromoDialog feature={feature as PlusFeature} onClose={() => undefined} />)
    const dialog = screen.getByRole('dialog', { name: title })
    expect(dialog).toHaveTextContent(text)
    expect(dialog).toHaveTextContent('MONI PLUS')
    expect(dialog.querySelector('img')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Conocer Moni Plus' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })

  it('"Conocer Moni Plus" goes to the real Plus screen; "Ahora no" and the X only close it', async () => {
    const onClose = vi.fn()
    const { unmount } = render(<PlusPromoDialog feature="goals" onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Conocer Moni Plus' }))
    expect(screen.getByRole('dialog', { name: 'plans:generic' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    unmount()
    render(<PlusPromoDialog feature="photo" onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('the photo, voice, assistant, groups and Mercado Pago promos open the Plus screen with their own reason', async () => {
    for (const [feature, reason] of [['photo', 'receipt'], ['voice', 'voice'], ['assistant', 'assistant'], ['groups', 'group'], ['mercadopago', 'mp_import']] as const) {
      const { unmount } = render(<PlusPromoDialog feature={feature} onClose={() => undefined} />)
      await userEvent.click(screen.getByRole('button', { name: 'Conocer Moni Plus' }))
      expect(screen.getByRole('dialog', { name: `plans:${reason}` })).toBeInTheDocument()
      unmount()
    }
  })
})

describe('PlusTag', () => {
  it('is a small "PLUS" label for Free people only', () => {
    plus.value = { isPlus: false, isFree: true }
    const { rerender } = render(<PlusTag />)
    expect(screen.getByText('PLUS')).toHaveAttribute('data-plus-tag')
    plus.value = { isPlus: true, isFree: false }
    rerender(<PlusTag />)
    expect(screen.queryByText('PLUS')).toBeNull()
  })
})
