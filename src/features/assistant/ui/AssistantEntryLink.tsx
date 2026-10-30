import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { MoniCat } from '@/shared/ui/MoniCat'

export const ASSISTANT_PATH = '/informes/asistente'

/** Entry to the assistant, shown inside the Informes screens. */
export function AssistantEntryLink() {
  return (
    <Link
      to={ASSISTANT_PATH}
      className="flex min-h-14 items-center gap-3 rounded-[22px] border border-sand bg-card px-4 py-3"
    >
      <MoniCat className="w-14 shrink-0" />
      <span className="flex-1">
        <span className="block text-[18px] font-extrabold">Asistente</span>
        <span className="block text-[14px] text-text-muted">Preguntale a Moni por tus números</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 text-text-muted" />
    </Link>
  )
}
