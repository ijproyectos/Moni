import moniCat from '@/assets/mascot/moni-gato-fortuna-animado.svg'
import { useAuth } from '@/features/auth/api/authContext'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { SHEET_SUGGESTIONS } from '../domain/chat'
import { AssistantConversation } from './AssistantConversation'

/**
 * Moni's chat as a sheet over Inicio: it opens small, with the little cat in the header, and grows as the conversation goes
 * (the one chat: questions and movements). The header (cat, title and X) and the box stay fixed; only the messages scroll. The conversation is kept while the app is open, so it survives closing the sheet.
 */
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
  const { user } = useAuth()
  return (
    <BottomSheet
      variant="chat"
      title="Moni"
      subtitle="Preguntame o contame un gasto"
      icon={<img src={moniCat} alt="" draggable={false} className="size-12 shrink-0 object-contain" />}
      onClose={onClose}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <AssistantConversation
          inSheet
          memoryKey={`sheet:${user?.id ?? 'anon'}`}
          initialQuestion={initialQuestion}
          initialDraft={initialDraft}
          suggestions={SHEET_SUGGESTIONS}
          greeting={`${name ? `Hola, ${name}.` : 'Hola.'} Preguntame por tus gastos, ingresos, saldos, metas o deudas, o contame un gasto («Gasté $18.000 en el chino») y lo anoto con tu confirmación.`}
        />
      </div>
    </BottomSheet>
  )
}
