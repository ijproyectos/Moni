import { MoniCat } from '@/shared/ui/MoniCat'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { SHEET_SUGGESTIONS } from '../domain/chat'
import { AssistantConversation } from './AssistantConversation'

/** "Hablá con Moni" as a sheet over Inicio: the one chat (questions and movements), without leaving the screen. */
export function AssistantSheet({
  name,
  initialQuestion,
  initialDraft,
  onClose,
}: {
  name?: string | null
  /** A question sent as soon as the chat opens. */
  initialQuestion?: string
  /** Text left typed in the box for the person to finish. */
  initialDraft?: string
  onClose: () => void
}) {
  return (
    <BottomSheet
      title="Hablá con Moni"
      subtitle="Preguntame o contame un gasto"
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
          initialQuestion={initialQuestion}
          initialDraft={initialDraft}
          suggestions={SHEET_SUGGESTIONS}
          greeting={`${name ? `Hola, ${name}.` : 'Hola.'} Preguntame por tus gastos, ingresos, saldos, metas o deudas, o contame un gasto («Gasté $18.000 en el chino») y lo anoto con tu confirmación.`}
        />
      </div>
    </BottomSheet>
  )
}
