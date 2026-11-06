import { MoniCat } from '@/shared/ui/MoniCat'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { SHEET_SUGGESTIONS } from '../domain/chat'
import { AssistantConversation } from './AssistantConversation'

/** "Preguntale a Moni" as a sheet over Inicio: the same assistant as the Asistente page, without leaving the screen. */
export function AssistantSheet({ name, onClose }: { name?: string | null; onClose: () => void }) {
  return (
    <BottomSheet
      title="Preguntale a Moni"
      subtitle="Respondo con los números de tu cuenta"
      icon={
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e3ebd3] dark:bg-sand"
        >
          <MoniCat className="w-8" />
        </span>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <AssistantConversation
          inSheet
          suggestions={SHEET_SUGGESTIONS}
          greeting={`${name ? `Hola, ${name}.` : 'Hola.'} Preguntame lo que quieras sobre tus gastos, ingresos, deudas y suscripciones.`}
        />
      </div>
    </BottomSheet>
  )
}
