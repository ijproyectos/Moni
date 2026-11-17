import { cn } from '@/shared/ui/cn'
import type { Story } from '../domain/stories'
import { RING_SEEN, RING_UNSEEN, STORY_TONES } from './storyTones'

interface StoriesRowProps {
  stories: readonly Story[]
  isSeen: (story: Story) => boolean
  onOpen: (index: number) => void
}

/** "Tu resumen de hoy": one 64px bubble per story; unseen ones wear the Menta ring, seen ones a grey one. */
export function StoriesRow({ stories, isSeen, onOpen }: StoriesRowProps) {
  return (
    <ul className="-mx-[18px] flex gap-3 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none]">
      {stories.map((story, index) => {
        const tone = STORY_TONES[story.tone]
        const seen = isSeen(story)
        return (
          <li key={story.id} className="w-[84px] shrink-0">
            <button
              type="button"
              onClick={() => onOpen(index)}
              aria-label={`${story.label}${seen ? ', ya vista' : ', nueva'}`}
              className="flex min-h-11 w-full flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E]"
            >
              <span
                aria-hidden="true"
                data-ring={seen ? 'seen' : 'unseen'}
                className="box-border flex size-[68px] rounded-full p-[3px]"
                style={{ background: seen ? RING_SEEN : RING_UNSEEN }}
              >
                <span
                  className={cn(
                    'box-border flex size-full items-center justify-center rounded-full border-[3px] border-[#F1EEDD] dark:border-canvas font-display font-bold leading-none',
                    story.bubble.length <= 3
                      ? 'text-[17px]'
                      : story.bubble.length <= 5
                        ? 'text-[13px]'
                        : 'text-[11px]',
                  )}
                  style={{ backgroundColor: tone.fill, color: tone.ink }}
                >
                  {story.bubble}
                </span>
              </span>
              <span className="line-clamp-2 w-full text-center text-[13px] font-bold leading-tight text-[#0B3D2E] dark:text-ink">
                {story.label}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
