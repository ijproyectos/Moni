import { Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { usePlus } from '@/features/plus/api/usePlus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { MoniCat } from '@/shared/ui/MoniCat'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Page, Panel } from '@/shared/ui/kit'
import { useAssistantChat } from '../api/useAssistantChat'
import {
  ASSISTANT_LIMITS,
  assistantErrorMessage,
  isSendable,
  SUGGESTIONS,
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

/** Informes > Asistente: chat with Moni about the person's own data (insights-chat Edge Function). */
export function AssistantPage() {
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
    <Page>
      <PageHeader title="Asistente" fallbackTo="/este-mes" />
      <section className="flex items-center gap-3 rounded-[24px] bg-cream p-4 text-forest">
        <MoniCat className="w-20 shrink-0" />
        <div className="flex-1">
          <h2 className="text-[20px] font-extrabold">Preguntale a Moni</h2>
          <p className="text-[15px] leading-5">
            Respondo con lo que encuentro en tus movimientos, vencimientos, cuotas y grupos.
          </p>
        </div>
      </section>

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
              {SUGGESTIONS.map((question) => (
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
            <p
              role="status"
              className="flex items-center gap-2 text-[15px] text-text-muted"
            >
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
            className="sticky bottom-28 z-20 -mx-4 flex items-center gap-2 bg-canvas px-4 py-2"
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
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime text-forest disabled:opacity-60"
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
    </Page>
  )
}
