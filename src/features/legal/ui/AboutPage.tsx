import { Link } from 'react-router'
import { AppVersion } from '@/shared/ui/AppVersion'
import { LegalLayout, LegalSection } from './LegalLayout'

/** "Acerca de": qué es Moni y links a Términos/Privacidad. */
export function AboutPage() {
  return (
    <LegalLayout title="Acerca de Moni">
      <LegalSection heading="Qué es Moni">
        <p>
          Moni es una app para anotar tus gastos e ingresos del día a día, armar presupuestos y metas de ahorro, y
          repartir cuentas con amigos, pareja o grupos. La idea es que lleves tus cuentas sin vueltas, sola o
          acompañada.
        </p>
      </LegalSection>

      <LegalSection heading="Legal">
        <p>
          <Link to="/legal/terminos" className="font-bold text-ink underline">
            Términos de uso
          </Link>
        </p>
        <p>
          <Link to="/legal/privacidad" className="font-bold text-ink underline">
            Política de privacidad
          </Link>
        </p>
      </LegalSection>

      <AppVersion />
    </LegalLayout>
  )
}
