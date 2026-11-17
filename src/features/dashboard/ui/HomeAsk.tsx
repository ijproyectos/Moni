import { ArrowUp, Mic } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useSpeechRecognition } from '@/features/ai/ui/useSpeechRecognition'
import catFace from '@/assets/mascot/expresion_feliz.svg'
import { SHEET_SUGGESTIONS } from '@/features/assistant/domain/chat'

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E]'
const QUESTIONS = ['¿Cómo voy este mes?', '¿Cuánto tengo?', '¿Qué pago pronto?', ...SHEET_SUGGESTIONS.filter((q) => q !== '¿Cuánto tengo?')]

/** "Preguntale a Moni…": the question goes to the real assistant (Plus), by typing, by voice or from a chip. */
export function HomeAsk({ plusBadge = false }: { plusBadge?: boolean }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const speech = useSpeechRecognition({ onTranscript: setDraft })

  function ask(question: string) {
    const text = question.trim()
    navigate('/informes/asistente', { state: text ? { question: text } : undefined })
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    ask(draft)
  }

  return (
    <section
      aria-label="Preguntale a Moni"
      className="mx-[18px] flex flex-col gap-2.5 rounded-[26px] border border-[#F0D58A] bg-[#F4E6B8] p-2 dark:border-[#5b4a1a] dark:bg-[#2b2a16]"
    >
      <form onSubmit={submit} className="flex items-center gap-2 rounded-[22px] bg-[#FAF8EC] p-1.5 dark:bg-card">
        <img src={catFace} alt="" className="size-[30px] shrink-0 rounded-full bg-[#E3B23C] object-contain p-0.5" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={plusBadge ? 'Preguntale a Moni, Plus' : 'Preguntale a Moni'}
          placeholder="Preguntale a Moni…"
          className="h-10 min-w-0 flex-1 bg-transparent text-[16px] text-[#0B3D2E] outline-none placeholder:text-[#566A5C] dark:text-ink"
        />
        {plusBadge && (
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full bg-[#2A1E00] px-2 text-[11px] font-extrabold leading-5 text-[#E3B23C]"
          >
            Plus
          </span>
        )}
        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            aria-label={speech.listening ? 'Dejar de escuchar' : 'Preguntar con la voz'}
            aria-pressed={speech.listening}
            className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-[#E3B23C] text-[#0B3D2E] ${RING}`}
          >
            <Mic aria-hidden="true" className="size-5" strokeWidth={2.3} />
          </button>
        )}
        <button
          type="submit"
          aria-label="Preguntar"
          className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0B3D2E] text-[#F1EEDD] ${RING}`}
        >
          <ArrowUp aria-hidden="true" className="size-5" strokeWidth={2.6} />
        </button>
      </form>
      <ul className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none]">
        {QUESTIONS.map((q) => (
          <li key={q} className="shrink-0">
            <button
              type="button"
              onClick={() => ask(q)}
              className={`min-h-9 whitespace-nowrap rounded-full border border-[#F0D58A] bg-[#FAF8EC] px-3.5 text-[14px] font-semibold text-[#0B3D2E] dark:border-[#5b4a1a] dark:bg-card dark:text-ink ${RING}`}
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
