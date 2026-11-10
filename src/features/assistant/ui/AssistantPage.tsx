import { MoniCat } from '@/shared/ui/MoniCat'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Page } from '@/shared/ui/kit'
import { SUGGESTIONS } from '../domain/chat'
import { AssistantConversation } from './AssistantConversation'

/** Informes > Asistente: chat with Moni about the person's own data (insights-chat Edge Function). */
export function AssistantPage() {
  return (
    <Page>
      <PageHeader title="Asistente" fallbackTo="/este-mes" />
      <section className="flex items-center gap-3 rounded-[24px] bg-cream p-4 text-on-bright">
        <MoniCat className="w-20 shrink-0" />
        <div className="flex-1">
          <h2 className="text-[20px] font-extrabold">Preguntale a Moni</h2>
          <p className="text-[15px] leading-5">
            Respondo con lo que encuentro en tus movimientos, vencimientos, cuotas y grupos.
          </p>
        </div>
      </section>
      <AssistantConversation suggestions={SUGGESTIONS} />
    </Page>
  )
}
