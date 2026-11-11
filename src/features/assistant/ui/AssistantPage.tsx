import { ChevronLeft } from 'lucide-react'
import { useGoBack } from '@/shared/lib/useGoBack'
import { MENTA_CIRCLE } from '@/shared/ui/mentaStyles'
import mascot from '@/assets/mascot/expresion_feliz.svg'
import { Page } from '@/shared/ui/kit'
import { SUGGESTIONS } from '../domain/chat'
import { AssistantConversation } from './AssistantConversation'

/** Header of the assistant: the cat, "¿Me conviene?", who it is, and the Plus chip. */
export function AssistantHeader({ onBack }: { onBack?: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-line pb-2.5">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Volver" className={MENTA_CIRCLE}>
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2.2} />
        </button>
      )}
      <img
        src={mascot}
        alt=""
        className="size-[42px] shrink-0 rounded-full border-2 border-lilac bg-card object-cover"
      />
      <div className="min-w-0 flex-1">
        <h1 className="text-[19px] font-semibold leading-tight tracking-[-0.02em]">¿Me conviene?</h1>
        <p className="flex items-center gap-1.5 text-[12.5px] text-text-muted">
          <span aria-hidden="true" className="size-[7px] rounded-full bg-mint-ink" />
          Moni · tu asistente
        </p>
      </div>
      <span className="rounded-full bg-[#FFE58A] px-2.5 py-1 text-[11.5px] font-bold tracking-[0.06em] text-[#17734B]">
        PLUS
      </span>
    </header>
  )
}

/** Informes > Asistente: chat with Moni about the person's own data (insights-chat Edge Function). */
export function AssistantPage() {
  const goBack = useGoBack('/este-mes')
  return (
    <Page>
      <AssistantHeader onBack={goBack} />
      <AssistantConversation
        suggestions={SUGGESTIONS}
        greeting="Hola. Contame qué querés comprar y cuánto sale (por ejemplo, “una campera de $180.000 en 3 cuotas”) y te digo si te conviene. También podés preguntarme por tus gastos, vencimientos, cuotas y grupos."
      />
    </Page>
  )
}
