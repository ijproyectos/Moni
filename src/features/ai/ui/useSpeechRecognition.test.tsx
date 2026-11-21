import { act, renderHook } from '@testing-library/react'
import { useSpeechRecognition } from './useSpeechRecognition'

class Fake {
  static instances: Fake[] = []
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() {
    Fake.instances.push(this)
  }
  say(...parts: string[]) {
    const results = Object.assign(
      parts.map((transcript) => ({ isFinal: true, 0: { transcript } })),
      {},
    )
    this.onresult?.({ results })
  }
}
const last = () => Fake.instances[Fake.instances.length - 1] as Fake
const win = window as unknown as Record<string, unknown>

beforeEach(() => {
  Fake.instances = []
  win.webkitSpeechRecognition = Fake
  vi.useFakeTimers()
})
afterEach(() => {
  delete win.webkitSpeechRecognition
  vi.useRealTimers()
})

function setup() {
  const onTranscript = vi.fn()
  const hook = renderHook(() => useSpeechRecognition({ onTranscript }))
  return { ...hook, onTranscript }
}

describe('useSpeechRecognition', () => {
  it('starts listening in Argentine Spanish and reports the transcript without repeated words', () => {
    const { result, onTranscript } = setup()
    act(() => result.current.start())
    expect(result.current.listening).toBe(true)
    expect(last().lang).toBe('es-AR')
    expect(last().start).toHaveBeenCalled()
    act(() => last().say('gasté', 'gasté quinientos'))
    expect(onTranscript).toHaveBeenLastCalledWith('gasté quinientos')
  })

  it('stop closes the microphone and shows "processing" until the browser answers', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => result.current.stop())
    expect(last().stop).toHaveBeenCalled()
    expect(result.current.listening).toBe(false)
    expect(result.current.processing).toBe(true)
    act(() => last().say('hola'))
    act(() => last().onend?.())
    expect(result.current.processing).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('does not stay "processing" for ever if the browser never answers', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => result.current.stop())
    act(() => void vi.advanceTimersByTime(3100))
    expect(result.current.processing).toBe(false)
    expect(last().abort).toHaveBeenCalled()
  })

  it('cancel closes at once and nothing said afterwards is applied', () => {
    const { result, onTranscript } = setup()
    act(() => result.current.start())
    const session = last()
    act(() => result.current.cancel())
    expect(session.abort).toHaveBeenCalled()
    expect(result.current.listening).toBe(false)
    act(() => session.say('tarde'))
    expect(onTranscript).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('stops by itself after a silence', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => void vi.advanceTimersByTime(3100))
    expect(last().stop).toHaveBeenCalled()
    expect(result.current.listening).toBe(false)
  })

  it.each([
    ['not-allowed', 'denied'],
    ['service-not-allowed', 'service'],
    ['audio-capture', 'no_mic'],
    ['network', 'network'],
    ['no-speech', 'no_speech'],
    ['language-not-supported', 'unavailable'],
  ])('maps the browser error %s to %s and stops looking active', (code, expected) => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => last().onerror?.({ error: code }))
    act(() => last().onend?.())
    expect(result.current.error).toBe(expected)
    expect(result.current.listening).toBe(false)
  })

  it('a session that ends with no words and no error says that nothing was heard (Safari)', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => last().onend?.())
    expect(result.current.error).toBe('no_speech')
  })

  it('a browser without speech recognition says "unsupported" instead of doing nothing', () => {
    delete win.webkitSpeechRecognition
    const { result } = setup()
    expect(result.current.supported).toBe(false)
    act(() => result.current.start())
    expect(result.current.error).toBe('unsupported')
    expect(result.current.listening).toBe(false)
  })

  it('a start that throws is reported and the microphone does not look active', () => {
    class Throwing extends Fake {
      override start = vi.fn(() => {
        throw new Error('already started')
      })
    }
    win.webkitSpeechRecognition = Throwing
    const { result } = setup()
    act(() => result.current.start())
    expect(result.current.error).toBe('unavailable')
    expect(result.current.listening).toBe(false)
  })
})
