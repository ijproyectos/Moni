import { cn } from '@/shared/ui/cn'
import type { Story } from '../domain/stories'
import { STORY_TONES } from './storyTones'

interface StoriesRowProps {
  stories: readonly Story[]
  isSeen: (story: Story) => boolean
  onOpen: (index: number) => void
}

/** "Para hoy": one bubble per story, side by side; the row scrolls sideways when there are more than fit. */
export function StoriesRow({ stories, isSeen, onOpen }: StoriesRowProps) {
  return (
    <ul className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-1">
      {stories.map((story, index) => {
        const tone = STORY_TONES[story.tone]
        const seen = isSeen(story)
        return (
          <li key={story.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onOpen(index)}
              aria-label={`${story.label}${seen ? ', ya vista' : ', nueva'}`}
              className="flex w-[72px] flex-col items-center gap-2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-[70px] items-center justify-center rounded-full border-[3px] p-[3px] transition-opacity',
                  seen && 'opacity-50',
                )}
                style={{ borderColor: tone.ring }}
              >
                <span
                  className={cn(
                    'flex size-full items-center justify-center rounded-full font-display font-extrabold leading-none',
                    story.bubble.length <= 3
                      ? 'text-[20px]'
                      : story.bubble.length <= 5
                        ? 'text-[15px]'
                        : 'text-[13px]',
                  )}
                  style={{ backgroundColor: tone.fill, color: tone.ink }}
                >
                  {story.bubble}
                </span>
              </span>
              <span className="w-full truncate text-center text-[14px] text-ink">
                {story.label}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
