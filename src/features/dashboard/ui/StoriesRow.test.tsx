import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Story } from '../domain/stories'
import { StoriesRow } from './StoriesRow'
import { RING_SEEN, RING_UNSEEN } from './storyTones'

const story = (id: string, label: string): Story => ({
  id,
  signature: id,
  label,
  bubble: '2',
  tone: 'green',
  priority: 1,
  slides: [{ title: label, body: 'x' }],
})

describe('StoriesRow', () => {
  it('draws a 64px bubble per story: conic Menta ring if unseen, grey if seen', async () => {
    const onOpen = vi.fn()
    const stories = [story('a', 'Cobros'), story('b', 'Metas')]
    render(<StoriesRow stories={stories} isSeen={(s) => s.id === 'b'} onOpen={onOpen} />)
    const unseen = screen.getByRole('button', { name: 'Cobros, nueva' })
    const seen = screen.getByRole('button', { name: 'Metas, ya vista' })
    const ringOf = (el: HTMLElement) => el.querySelector('[data-ring]') as HTMLElement
    expect(ringOf(unseen)).toHaveClass('size-16')
    expect(ringOf(unseen)).toHaveAttribute('data-ring', 'unseen')
    expect(ringOf(unseen).style.background).toContain('conic-gradient')
    expect(RING_UNSEEN).toContain('#1F8A5B')
    expect(RING_UNSEEN).toContain('#C9BDF7')
    expect(RING_UNSEEN).toContain('#FFE58A')
    expect(ringOf(seen)).toHaveAttribute('data-ring', 'seen')
    expect(RING_SEEN).toBe('#C7D6CB')
    await userEvent.setup().click(seen)
    expect(onOpen).toHaveBeenCalledWith(1)
  })
})
