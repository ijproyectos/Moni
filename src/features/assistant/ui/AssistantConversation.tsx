import { ArrowUp, Mic, MicOff, X } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { mergeDictation } from '@/features/ai/domain/dictation'
import { useSpeechRecognition, type SpeechError } from '@/features/ai/ui/useSpeechRecognition'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useParseMovements } from '@/features/ai/api/useParseMovements'
import { warningsNotice, type DraftMovement } from '@/features/ai/domain/draft'
import { useCategories } from '@/features/categories/api/useCategories'
import { prepareDrafts } from '@/features/transactions/domain/prepareDrafts'
import { looksLikeMovement } from '@/features/transactions/domain/talkIntent'
import { DraftConfirmation } from '@/features/transactions/ui/DraftConfirmation'
import { isPlusRequired, toUserMessage } from '@/shared/lib/errors'
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

/** What the chat says when the dictation does not work: what happened and what to do, never a silent failure. */
const DICTATION_MESSAGES: Record<SpeechError, string> = {
  denied: 'El micrófono está bloqueado. Habilitalo en los permisos del navegador o del sitio para poder dictar, o escribí tu consulta.',
  service: 'El dictado de tu dispositivo no está activo. En iPhone: Ajustes › General › Teclado › Dictado, o abrí Moni desde Safari. Mientras tanto, escribí tu consulta.',
  no_mic: 'No encuentro un micrófono en este dispositivo. Escribí tu consulta.',
  network: 'No pude conectarme con el servicio de voz. Revisá tu conexión y probá de nuevo, o escribí tu consulta.',
  no_speech: 'No te escuché. Probá de nuevo, más cerca del micrófono, o escribí tu consulta.',
  unsupported: 'Este navegador no permite dictar por voz. Escribí tu consulta o abrí Moni en Chrome (Android o computadora) o Safari (iPhone).',
  unavailable: 'El dictado no está disponible ahora. Escribí tu consulta.',
}

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
  /** A question typed in Inicio: it is sent once when the conversation opens (Plus only; Free sees the upsell). */
  initialQuestion?: string
  /** Text left typed in the box (not sent). */
  initialDraft?: string
  /** Keeps the conversation in memory under this key (the chat sheet: closing and opening it does not lose it). */
  memoryKey?: string
}

/** The conversation with Moni (suggestions, log, input, Plus gate): shared by the Asistente page and the Inicio sheet. */
export function AssistantConversation({
  suggestions,
  greeting,
  inSheet = false,
  initialQuestion,
  initialDraft,
  memoryKey,
}: AssistantConversationProps) {
  const plus = usePlus()
  const chat = useAssistantChat(memoryKey)
  const [draft, setDraft] = useState(initialDraft ?? '')
  const [upsell, setUpsell] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  /** What was written when the dictation started: the dictation goes after it and "Cancelar" gives it back. */
  const dictationBase = useRef('')
  const speech = useSpeechRecognition({
    onTranscript: (spoken) => setDraft(mergeDictation(dictationBase.current, spoken).slice(0, ASSISTANT_LIMITS.maxChars)),
  })
  const dictating = speech.listening || speech.processing

  function toggleMic() {
    if (speech.processing) return
    if (speech.listening) {
      speech.stop()
      return
    }
    dictationBase.current = draft
    speech.start()
  }

  function cancelDictation() {
    speech.cancel()
    setDraft(dictationBase.current)
  }
  const initialSent = useRef(false)
  const { send, append } = chat
  const isFree = plus.isFree
  const parse = useParseMovements()
  const accountsQuery = useAccounts()
  const categoriesQuery = useCategories()
  const [reviewing, setReviewing] = useState<{ drafts: DraftMovement[]; notice: string | null } | null>(null)
  const [parsePlus, setParsePlus] = useState(false)

  /** One chat for everything: a movement ("Gasté $18.000 en el chino") is read and confirmed; the rest goes to the assistant. */
  const ask = useCallback(
    (text: string): boolean => {
      if (!isSendable(text) || chat.isPending || parse.isPending) return false
      if (!looksLikeMovement(text)) return send(text)
      const said = text.trim()
      append('user', said)
      parse.mutate(said, {
        onSuccess: (response) => {
          const drafts = prepareDrafts(response, accountsQuery.data ?? [], categoriesQuery.data ?? [])
          if (drafts.length === 0) {
            append(
              'assistant',
              'No encontré gastos ni ingresos en lo que me contaste. ¿Me lo escribís con el monto? Por ejemplo: «Gasté $18.000 en el chino».',
            )
            return
          }
          const missing = drafts.some((d) => d.accountId === '' || d.categoryId === '')
          const summary = drafts
            .map((d) => `${d.kind === 'income' ? 'Ingreso' : 'Gasto'} de $${d.amount}${d.note ? ` · ${d.note}` : ''}`)
            .join('\n')
          append(
            'assistant',
            `Entendí:\n${summary}\n${missing ? 'Me faltan datos (cuenta o categoría): elegilos al revisar. ' : ''}Revisalo y confirmá para guardarlo; hasta entonces no se guarda nada.`,
            drafts,
          )
          const notice = warningsNotice(response.warnings)
          if (notice) append('assistant', notice)
        },
        onError: (error) => {
          if (isPlusRequired(error)) setParsePlus(true)
          else append('assistant', toUserMessage(error))
        },
      })
      return true
    },
    [accountsQuery.data, append, categoriesQuery.data, chat.isPending, parse, send],
  )

  useEffect(() => {
    if (!initialQuestion || initialSent.current || isFree) return
    initialSent.current = true
    ask(initialQuestion)
  }, [initialQuestion, isFree, ask])

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' })
  }, [chat.messages.length, chat.isPending])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (dictating) speech.cancel()
    if (ask(draft)) setDraft('')
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
          {/* In the sheet only the messages scroll: the header stays on top and the box stays at the bottom. */}
          <div className={inSheet ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain' : 'contents'}>
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
                  {m.drafts && (
                    <button
                      type="button"
                      onClick={() => setReviewing({ drafts: m.drafts as DraftMovement[], notice: null })}
                      className={cn(
                        'min-h-11 self-start rounded-full bg-[#E3B23C] px-4 text-[14px] font-extrabold text-[#2A1E00]',
                        FOCUS_RING,
                      )}
                    >
                      Revisar y guardar
                    </button>
                  )}
                  {purchase && <PurchaseVerdictCard request={purchase} message={m.content} />}
                </Fragment>
              )
            })}
          </div>

          {(chat.isPending || parse.isPending) && (
            <p role="status" className="flex items-center gap-2 text-[15px] text-text-muted">
              <span aria-hidden="true" className="flex gap-1">
                <span className="size-2 animate-pulse rounded-full bg-text-muted" />
                <span className="size-2 animate-pulse rounded-full bg-text-muted [animation-delay:150ms]" />
                <span className="size-2 animate-pulse rounded-full bg-text-muted [animation-delay:300ms]" />
              </span>
              {parse.isPending ? 'Moni está leyendo tu movimiento…' : 'Moni está mirando tus datos…'}
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
          </div>

          <div className={inSheet ? 'flex shrink-0 flex-col gap-2 pt-1' : 'contents'}>
          <div
            role="group"
            aria-label="Preguntas sugeridas"
            className="-mr-5 flex gap-2 overflow-x-auto pr-5 [scrollbar-width:none]"
          >
            {suggestions.map((question) => (
              <button
                key={question}
                type="button"
                disabled={chat.isPending || parse.isPending}
                onClick={() => ask(question)}
                className={cn(
                  'min-h-11 shrink-0 whitespace-nowrap rounded-full bg-card px-[13px] text-[13px] font-medium text-ink disabled:opacity-60',
                  FOCUS_RING,
                )}
              >
                {question}
              </button>
            ))}
          </div>

          {(dictating || speech.error) && (
            <div
              role={speech.error ? 'alert' : 'status'}
              className={cn(
                'flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[14px] leading-5',
                speech.error ? 'bg-expense/10 text-expense' : 'bg-lilac text-ink',
              )}
            >
              {speech.error ? (
                <>
                  <p className="flex-1">{DICTATION_MESSAGES[speech.error]}</p>
                  <button
                    type="button"
                    aria-label="Cerrar aviso"
                    onClick={speech.clearError}
                    className={cn('-mr-1.5 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full', FOCUS_RING)}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-expense motion-safe:animate-pulse" />
                  <p className="flex-1 font-bold">{speech.listening ? 'Escuchando…' : 'Procesando…'}</p>
                  <button
                    type="button"
                    onClick={cancelDictation}
                    className={cn('-my-1 min-h-9 shrink-0 rounded-full px-3 text-[13px] font-extrabold underline', FOCUS_RING)}
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>
          )}

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
                placeholder="Preguntale a Moni o contale un gasto…"
                autoComplete="off"
                readOnly={dictating}
                className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-[#8A9A90]"
              />
              <button
                type="button"
                aria-label={speech.listening ? 'Detener dictado' : 'Dictar pregunta'}
                aria-pressed={speech.listening}
                disabled={speech.processing}
                onClick={toggleMic}
                className={cn(
                  'relative flex size-[38px] shrink-0 items-center justify-center rounded-full bg-sand text-ink disabled:opacity-60',
                  speech.listening && 'bg-lilac',
                  !speech.supported && 'text-text-muted',
                  FOCUS_RING,
                )}
              >
                {speech.listening && (
                  <span aria-hidden="true" className="absolute inset-0 rounded-full bg-lilac motion-safe:animate-ping" />
                )}
                {speech.supported ? (
                  <Mic aria-hidden="true" className="relative size-[18px]" />
                ) : (
                  <MicOff aria-hidden="true" className="relative size-[18px]" />
                )}
              </button>
              <button
                type="submit"
                aria-label="Enviar"
                disabled={chat.isPending || parse.isPending || !isSendable(draft)}
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
          </div>
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
      {parsePlus && <PlusSheet reason="voice" onClose={() => setParsePlus(false)} />}
      {reviewing && (
        <DraftConfirmation
          initialDrafts={reviewing.drafts}
          notice={reviewing.notice}
          onClose={() => setReviewing(null)}
        />
      )}
    </>
  )
}
