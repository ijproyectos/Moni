import { getSupportEmail } from '@/features/support/domain/support'
import { Link } from 'react-router'
import { LegalLayout, LegalSection } from './LegalLayout'

const LAST_UPDATED = '23 de noviembre de 2026'

/** "Política de privacidad": qué datos guardamos y para qué. */
export function PrivacyPage() {
  const supportEmail = getSupportEmail()

  return (
    <LegalLayout title="Privacidad" subtitle={`Última actualización: ${LAST_UPDATED}`}>
      <LegalSection heading="Qué datos guardamos">
        <p>
          Guardamos lo que hace falta para que Moni funcione: tu nombre y foto (los que trae tu cuenta de Google o de
          Apple), tus gastos e ingresos, categorías, presupuestos, metas de ahorro, viajes y la información de los
          grupos de los que participás. Si usás el Asistente, también guardamos tu conversación con él.
        </p>
      </LegalSection>

      <LegalSection heading="Cómo entrás a Moni">
        <p>
          Iniciás sesión con tu cuenta de Google o de Apple; no manejamos ni guardamos tu contraseña, eso lo hace
          Google o Apple.
        </p>
      </LegalSection>

      <LegalSection heading="Funciones con inteligencia artificial">
        <p>
          Cuando le sacás una foto a un ticket, le escribís un gasto a Moni por WhatsApp o usás el Asistente,
          mandamos ese contenido a un proveedor externo de inteligencia artificial para que lo interprete. No lo
          usamos para entrenar modelos de terceros ni lo compartimos con nadie más que ese proveedor y solo para
          responder tu pedido.
        </p>
      </LegalSection>

      <LegalSection heading="Mercado Pago">
        <p>
          Si conectás tu cuenta de Mercado Pago, leemos tus movimientos para ayudarte a cargarlos automáticamente.
          No vemos tu clave ni tus datos de tarjeta: esa parte la maneja Mercado Pago.
        </p>
      </LegalSection>

      <LegalSection heading="Notificaciones">
        <p>
          Si activás las notificaciones, usamos ese permiso para avisarte cosas como vencimientos, resúmenes o
          movimientos de tus grupos. Podés desactivarlas cuando quieras desde Configuración o desde los permisos de
          tu dispositivo.
        </p>
      </LegalSection>

      <LegalSection heading="Grupos compartidos">
        <p>
          Dentro de un grupo, las demás personas ven tu nombre, tu foto y los gastos que cargás ahí. No vemos razón
          para compartir esa información con nadie fuera del grupo.
        </p>
      </LegalSection>

      <LegalSection heading="Con quién compartimos datos">
        <p>
          No vendemos tus datos. Los compartimos solo con los proveedores que necesitamos para que Moni funcione
          (por ejemplo, el que aloja la base de datos, el que envía las notificaciones push, y los proveedores de
          inteligencia artificial y de Mercado Pago mencionados arriba), y solo lo necesario para prestar ese
          servicio.
        </p>
      </LegalSection>

      <LegalSection heading="Tus datos son tuyos">
        <p>
          Podés exportar tus movimientos desde Configuración cuando quieras, y pedir que eliminemos tu cuenta y tus
          datos. Si estás en un grupo, lo que cargaste ahí queda visible para los demás hasta que se saldan las
          cuentas pendientes, como se explica en los Términos de uso.
        </p>
      </LegalSection>

      <LegalSection heading="Cambios en esta política">
        <p>
          Si cambiamos algo relevante de esta política, te avisamos dentro de la app antes de que entre en
          vigencia.
        </p>
      </LegalSection>

      <LegalSection heading="Contacto">
        <p>
          Cualquier duda sobre tus datos, escribinos desde{' '}
          <Link to="/soporte" className="font-bold text-ink underline">
            Ayuda y contacto
          </Link>{' '}
          dentro de la app{supportEmail ? ` o a ${supportEmail}` : ''}.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
