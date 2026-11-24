import { getSupportEmail } from '@/features/support/domain/support'
import { Link } from 'react-router'
import { LegalLayout, LegalSection } from './LegalLayout'

const LAST_UPDATED = '23 de noviembre de 2026'

/** "Términos de uso": qué podés esperar de Moni y qué esperamos de vos. */
export function TermsPage() {
  const supportEmail = getSupportEmail()

  return (
    <LegalLayout title="Términos de uso" subtitle={`Última actualización: ${LAST_UPDATED}`}>
      <LegalSection heading="Qué es Moni">
        <p>
          Moni te deja anotar gastos e ingresos, armar presupuestos y metas de ahorro, y compartir cuentas con otras
          personas en grupos. Te damos una licencia personal, intransferible y revocable para usar la app: no está
          permitido revenderla, copiarla ni intentar desarmarla.
        </p>
      </LegalSection>

      <LegalSection heading="No es asesoramiento financiero">
        <p>
          Los resúmenes, proyecciones, conversiones de moneda y consejos del Asistente son estimaciones para
          ayudarte a entender tus números, no recomendaciones profesionales. No tomes decisiones de inversión,
          crédito o impuestos basándote solo en lo que te muestra Moni.
        </p>
      </LegalSection>

      <LegalSection heading="Funciones con inteligencia artificial">
        <p>
          Algunas funciones (leer un ticket con la cámara, cargar un gasto escribiéndole a Moni por WhatsApp, o
          charlar con el Asistente) usan un proveedor externo de inteligencia artificial para interpretar lo que
          mandás. Puede equivocarse: revisá el monto, la categoría y la fecha antes de confirmar cualquier carga.
        </p>
      </LegalSection>

      <LegalSection heading="Tus datos son tuyos">
        <p>
          Los gastos, ingresos, metas y grupos que cargás son tuyos. Podés exportarlos y, si lo necesitás, borrar tu
          cuenta cuando quieras desde Configuración. Sos responsable de hacer tus propias copias si te importa no
          perder esa información.
        </p>
      </LegalSection>

      <LegalSection heading="Tu cuenta">
        <p>
          Entrás a Moni con tu cuenta de Google. Sos responsable de lo que pase dentro de tu cuenta mientras esté
          activa en tu dispositivo.
        </p>
      </LegalSection>

      <LegalSection heading="Grupos compartidos">
        <p>
          Si formás parte de un grupo, las demás personas del grupo ven los gastos, tu nombre y tu foto dentro de
          ese grupo. Moni no mueve ni transfiere dinero entre ustedes: solo lleva la cuenta de quién puso qué. Si
          borrás tu cuenta estando en un grupo, lo que cargaste queda visible para los demás hasta que se saldan las
          cuentas pendientes.
        </p>
      </LegalSection>

      <LegalSection heading="Mercado Pago">
        <p>
          Moni se integra con Mercado Pago para que puedas traer tus movimientos automáticamente. Esa integración es
          opcional y Moni no tiene ninguna afiliación con Mercado Pago más allá de usar su conexión para leer tus
          pagos.
        </p>
      </LegalSection>

      <LegalSection heading="Disponibilidad y cambios">
        <p>
          Hacemos lo posible para que Moni esté siempre disponible, pero no garantizamos un servicio sin
          interrupciones. Podemos agregar, cambiar o discontinuar funciones; si el cambio es importante, te
          avisamos dentro de la app.
        </p>
      </LegalSection>

      <LegalSection heading="Responsabilidad">
        <p>
          Moni se ofrece "tal cual". En la medida en que lo permita la ley, no somos responsables por decisiones que
          tomes basándote en la información de la app.
        </p>
      </LegalSection>

      <LegalSection heading="Dar de baja tu cuenta">
        <p>
          Podés dejar de usar Moni cuando quieras y eliminar tu cuenta desde Configuración. Podemos suspender una
          cuenta si detectamos un uso dañino, abusivo o ilegal de la app.
        </p>
      </LegalSection>

      <LegalSection heading="Propiedad intelectual">
        <p>
          Moni, su marca y su diseño nos pertenecen. La información que cargás (tus gastos, metas, etc.) es tuya.
        </p>
      </LegalSection>

      <LegalSection heading="Ley aplicable">
        <p>
          Estos términos se rigen por las leyes de la República Argentina, sin perjuicio de los derechos de
          consumidor que te correspondan según el país donde vivís.
        </p>
      </LegalSection>

      <LegalSection heading="Cambios en estos términos">
        <p>
          Si cambiamos algo relevante de estos términos, te lo avisamos dentro de la app. Seguir usando Moni después
          de ese aviso implica que los aceptás.
        </p>
      </LegalSection>

      <LegalSection heading="Contacto">
        <p>
          Podés escribirnos desde{' '}
          <Link to="/soporte" className="font-bold text-ink underline">
            Ayuda y contacto
          </Link>{' '}
          dentro de la app{supportEmail ? ` o a ${supportEmail}` : ''}.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
