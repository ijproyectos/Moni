import { Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { usePlus } from '@/features/plus/api/usePlus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { Panel } from '@/shared/ui/kit'
import { useAssistantChat } from '../api/useAssistantChat'
import {
  ASSISTANT_LIMITS,
  assistantErrorMessage,
  isSendable,
  type ChatMessage,
} from '../domain/chat'

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'
  return (
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <p
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] px-4 py-3 text-[16px] leading-6',
          mine
            ? 'rounded-br-md bg-forest text-cream'
            : 'rounded-bl-md border border-line bg-card text-ink',
        )}
      >
        <span className="sr-only">{mine ? 'Vos: ' : 'Moni: '}</span>
        {message.content}
      </p>
    </li>
  )
}

interface AssistantConversationProps {
  /** Quick questions shown while the conversation is empty; each one goes through the real assistant. */
  suggestions: readonly string[]
  /** Shown as Moni's first bubble while nothing has been asked (display only: it is not sent to the assistant). */
  greeting?: ReactNode
  /** In the sheet the form stays in the flow; on the page it sticks above the bottom bar. */
  inSheet?: boolean
}

/** The conversation with Moni (suggestions, log, input, Plus gate): shared by the Asistente page and the Inicio sheet. */
export function AssistantConversation({
  suggestions,
  greeting,
  inSheet = false,
}: AssistantConversationProps) {
  const plus = usePlus()
  const chat = useAssistantChat()
  const [draft, setDraft] = useState('')
  const [upsell, setUpsell] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' })
  }, [chat.messages.length, chat.isPending])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (chat.send(draft)) setDraft('')
  }

  // The client gate is only UX (shown after the server said "free"); the function enforces it anyway.
  const locked = plus.isFree || chat.plusRequired

  return (
    <>
      {locked ? (
        <Panel className="flex flex-col gap-3">
          <h2 className="text-[20px] font-extrabold">El asistente es de Moni Plus</h2>
          <p className="text-[16px] leading-6">
            Con Moni Plus le preguntás a Moni por tus números. Lo manual sigue siendo gratis.
          </p>
          <Button onClick={() => setUpsell(true)}>Conocer Moni Plus</Button>
        </Panel>
      ) : (
        <>
          {chat.messages.length === 0 ? (
            <div className="flex flex-col gap-2" role="group" aria-label="Preguntas sugeridas">
              {greeting && (
                <p className="mb-1 max-w-[90%] rounded-[20px] rounded-bl-md border border-line bg-card px-4 py-3 text-[16px] leading-6 text-ink">
                  <span className="sr-only">Moni: </span>
                  {greeting}
                </p>
              )}
              {suggestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={chat.isPending}
                  onClick={() => chat.send(question)}
                  className="min-h-11 rounded-full border border-line bg-card px-4 py-2 text-left text-[16px] font-bold text-ink disabled:opacity-60"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : (
            <ul
              role="log"
              aria-label="Conversación con Moni"
              aria-live="polite"
              className="flex flex-col gap-3"
            >
              {chat.messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
            </ul>
          )}

          {chat.isPending && (
            <p role="status" className="flex items-center gap-2 text-[15px] text-text-muted">
              <span aria-hidden="true" className="flex gap-1">
                <span className="size-2 animate-pulse rounded-full bg-text-muted" />
                <span className="size-2 animate-pulse rounded-full bg-text-muted [animation-delay:150ms]" />
                <span className="size-2 animate-pulse rounded-full bg-text-muted [animation-delay:300ms]" />
              </span>
              Moni está mirando tus datos…
            </p>
          )}

          {chat.error && !chat.plusRequired && (
            <div role="alert" className="flex flex-col items-start gap-1 text-[15px] text-expense">
              <p>{assistantErrorMessage(chat.error)}</p>
              <button
                type="button"
                onClick={chat.retry}
                className="min-h-11 font-extrabold underline"
              >
                Reintentar
              </button>
            </div>
          )}
          <div ref={endRef} />

          <form
            onSubmit={submit}
            className={cn(
              'flex items-center gap-2 bg-canvas py-2',
              !inSheet && 'sticky bottom-0 z-20 -mx-5 px-5 pb-[max(env(safe-area-inset-bottom),8px)]',
            )}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={ASSISTANT_LIMITS.maxChars}
              aria-label="Tu pregunta"
              placeholder="Preguntale algo a Moni"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 rounded-full border border-line bg-card px-4 text-[16px] text-ink"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={chat.isPending || !isSendable(draft)}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-forest text-cream disabled:opacity-60 dark:bg-lime dark:text-forest"
            >
              <Send aria-hidden="true" className="size-5" />
            </button>
          </form>
          <p className="text-center text-[13px] text-text-muted">
            Moni puede equivocarse y no da asesoramiento financiero.
          </p>
        </>
      )}

      {(upsell || chat.plusRequired) && (
        <PlusSheet
          reason="assistant"
          onClose={() => {
            setUpsell(false)
            if (chat.plusRequired) chat.clear()
          }}
        />
      )}
    </>
  )
}
