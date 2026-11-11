import { ArrowUp, Mic } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSpeechRecognition } from '@/features/ai/ui/useSpeechRecognition'
import { usePlus } from '@/features/plus/api/usePlus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Panel } from '@/shared/ui/kit'
import { useAssistantChat } from '../api/useAssistantChat'
import {
  ASSISTANT_LIMITS,
  assistantErrorMessage,
  isSendable,
  type ChatMessage,
} from '../domain/chat'
import { parsePurchaseMessage } from '../domain/purchaseVerdict'
import { PurchaseVerdictCard } from './PurchaseVerdictCard'

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'
  return (
    <p
      className={cn(
        'max-w-[86%] whitespace-pre-wrap break-words px-3.5 py-[9px] text-[14.5px] leading-[1.35]',
        mine
          ? 'self-end rounded-[26px_20px_6px_20px] bg-mint text-white'
          : 'self-start rounded-[26px_20px_20px_6px] bg-card text-ink',
      )}
    >
      <span className="sr-only">{mine ? 'Vos: ' : 'Moni: '}</span>
      {message.content}
    </p>
  )
}

function MoniBubble({ children }: { children: ReactNode }) {
  return (
    <p className="self-start max-w-[86%] rounded-[26px_20px_20px_6px] bg-card px-3.5 py-[9px] text-[14.5px] leading-[1.35] text-ink">
      <span className="sr-only">Moni: </span>
      {children}
    </p>
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
  const speech = useSpeechRecognition({ onTranscript: setDraft })

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
          <div
            role="log"
            aria-label="Conversación con Moni"
            aria-live="polite"
            className="flex flex-col gap-2"
          >
            {chat.messages.length === 0 && greeting && <MoniBubble>{greeting}</MoniBubble>}
            {chat.messages.map((m) => {
              const purchase = m.role === 'user' ? parsePurchaseMessage(m.content) : null
              return (
                <Fragment key={m.id}>
                  <Bubble message={m} />
                  {purchase && <PurchaseVerdictCard request={purchase} message={m.content} />}
                </Fragment>
              )
            })}
          </div>

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

          <div
            role="group"
            aria-label="Preguntas sugeridas"
            className="-mr-5 flex gap-2 overflow-x-auto pr-5 [scrollbar-width:none]"
          >
            {suggestions.map((question) => (
              <button
                key={question}
                type="button"
                disabled={chat.isPending}
                onClick={() => chat.send(question)}
                className={cn(
                  'min-h-11 shrink-0 whitespace-nowrap rounded-full bg-card px-[13px] text-[13px] font-medium text-ink disabled:opacity-60',
                  FOCUS_RING,
                )}
              >
                {question}
              </button>
            ))}
          </div>

          <form
            onSubmit={submit}
            className={cn(
              'flex items-center gap-2 bg-canvas py-2',
              !inSheet && 'sticky bottom-0 z-20 -mx-5 px-5 pb-[max(env(safe-area-inset-bottom),8px)]',
            )}
          >
            <div className="flex h-[50px] min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-card pl-4 pr-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-mint-ink">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={ASSISTANT_LIMITS.maxChars}
                aria-label="Tu pregunta"
                placeholder="Preguntale a Moni…"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-[#8A9A90]"
              />
              {speech.supported && (
                <button
                  type="button"
                  aria-label={speech.listening ? 'Detener dictado' : 'Dictar pregunta'}
                  aria-pressed={speech.listening}
                  onClick={speech.listening ? speech.stop : speech.start}
                  className={cn(
                    'flex size-[38px] shrink-0 items-center justify-center rounded-full bg-sand text-ink',
                    speech.listening && 'bg-lilac',
                    FOCUS_RING,
                  )}
                >
                  <Mic aria-hidden="true" className="size-[18px]" />
                </button>
              )}
              <button
                type="submit"
                aria-label="Enviar"
                disabled={chat.isPending || !isSendable(draft)}
                className={cn(
                  'flex size-[38px] shrink-0 items-center justify-center rounded-full bg-mint text-white disabled:opacity-60',
                  FOCUS_RING,
                )}
              >
                <ArrowUp aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
              </button>
            </div>
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
