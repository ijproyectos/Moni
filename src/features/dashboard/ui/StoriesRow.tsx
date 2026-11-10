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
    <ul className="grid grid-cols-4 gap-2">
      {stories.map((story, index) => {
        const tone = STORY_TONES[story.tone]
        const seen = isSeen(story)
        return (
          <li key={story.id} className="flex justify-center">
            <button
              type="button"
              onClick={() => onOpen(index)}
              aria-label={`${story.label}${seen ? ', ya vista' : ', nueva'}`}
              className="flex min-h-11 w-full flex-col items-center gap-[5px] rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
            >
              <span
                aria-hidden="true"
                data-ring={seen ? 'seen' : 'unseen'}
                className="box-border flex size-16 rounded-full p-[3px]"
                style={{ background: seen ? RING_SEEN : RING_UNSEEN }}
              >
                <span
                  className={cn(
                    'box-border flex size-full items-center justify-center rounded-full border-[3px] border-canvas font-display font-bold leading-none',
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
              <span className="w-full truncate text-center text-[11.5px] font-semibold text-ink">
                {story.label}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
