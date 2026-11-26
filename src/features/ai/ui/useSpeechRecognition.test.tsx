import { act, renderHook, waitFor } from '@testing-library/react'
import { PlusRequiredError } from '@/shared/lib/errors'
import { OfflineError } from '@/shared/lib/offline'
import { AiError } from '../api/aiRepository'
import { useSpeechRecognition } from './useSpeechRecognition'

const { transcribeAudio } = vi.hoisted(() => ({ transcribeAudio: vi.fn() }))
vi.mock('../api/aiRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/aiRepository')>()
  return { ...actual, transcribeAudio }
})

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

describe('server-side fallback', () => {
  class FakeRecorder {
    static instances: FakeRecorder[] = []
    static isTypeSupported = vi.fn(() => true)
    state: 'inactive' | 'recording' = 'inactive'
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    tracks = [{ stop: vi.fn() }]
    constructor() {
      FakeRecorder.instances.push(this)
    }
    start = vi.fn(() => {
      this.state = 'recording'
    })
    stop = vi.fn(() => {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['clip']) })
      this.onstop?.()
    })
  }
  const lastRecorder = () => FakeRecorder.instances[FakeRecorder.instances.length - 1] as FakeRecorder
  const getUserMedia = vi.fn()

  beforeEach(() => {
    // The outer suite uses fake timers; `waitFor` polls with real ones and jsdom's FileReader completes on a real
    // task, so both would hang forever here.
    vi.useRealTimers()
    FakeRecorder.instances = []
    transcribeAudio.mockReset()
    getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
    ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    })
  })
  afterEach(() => {
    delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder
    vi.useFakeTimers()
  })

  it('is offered for "no te escuché" (no retry would fix a flaky recognizer), not while idle', () => {
    const { result } = setup()
    expect(result.current.canFallback).toBe(false)
    act(() => result.current.start())
    act(() => last().onerror?.({ error: 'no-speech' }))
    act(() => last().onend?.())
    expect(result.current.error).toBe('no_speech')
    expect(result.current.canFallback).toBe(true)
  })

  it('is never offered for permission, microphone or network problems (the fallback needs the same mic/network)', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => last().onerror?.({ error: 'not-allowed' }))
    act(() => last().onend?.())
    expect(result.current.error).toBe('denied')
    expect(result.current.canFallback).toBe(false)
  })

  it('records, uploads and reports the transcript, going through listening then transcribing', async () => {
    const { result, onTranscript } = setup()
    act(() => result.current.start())
    act(() => last().onerror?.({ error: 'no-speech' }))
    act(() => last().onend?.())
    expect(result.current.canFallback).toBe(true)

    let resolveTranscribe: (text: string) => void = () => undefined
    transcribeAudio.mockReturnValue(new Promise((resolve) => (resolveTranscribe = resolve)))

    await act(async () => {
      result.current.startFallback()
      await Promise.resolve()
    })
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(result.current.listening).toBe(true)
    expect(result.current.error).toBeNull()

    act(() => result.current.stop())
    expect(lastRecorder().stop).toHaveBeenCalled()
    expect(result.current.listening).toBe(false)
    expect(result.current.transcribing).toBe(true)

    await act(async () => {
      resolveTranscribe('gasté 8000 en el super')
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.transcribing).toBe(false))
    expect(onTranscript).toHaveBeenCalledWith('gasté 8000 en el super')
    expect(result.current.error).toBeNull()
  })

  it('maps a Plus-required failure distinctly from a generic one', async () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => last().onerror?.({ error: 'no-speech' }))
    act(() => last().onend?.())
    transcribeAudio.mockRejectedValue(new PlusRequiredError())

    await act(async () => {
      result.current.startFallback()
      await Promise.resolve()
    })
    await act(async () => {
      result.current.stop()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.error).toBe('plus_required'))
    expect(result.current.transcribing).toBe(false)
  })

  it('maps a daily quota error and an offline error to their own messages', async () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => last().onerror?.({ error: 'no-speech' }))
    act(() => last().onend?.())
    transcribeAudio.mockRejectedValue(new AiError('ai_quota_exceeded'))

    await act(async () => {
      result.current.startFallback()
      await Promise.resolve()
    })
    await act(async () => {
      result.current.stop()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.error).toBe('quota_exceeded'))

    transcribeAudio.mockRejectedValue(new OfflineError())
    act(() => result.current.clearError())
    await act(async () => {
      result.current.startFallback()
      await Promise.resolve()
    })
    await act(async () => {
      result.current.stop()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.error).toBe('network'))
  })

  it('cancelling while recording discards the clip: nothing is uploaded', async () => {
    const { result, onTranscript } = setup()
    act(() => result.current.start())
    act(() => last().onerror?.({ error: 'no-speech' }))
    act(() => last().onend?.())

    await act(async () => {
      result.current.startFallback()
      await Promise.resolve()
    })
    act(() => result.current.cancel())
    expect(transcribeAudio).not.toHaveBeenCalled()
    expect(onTranscript).not.toHaveBeenCalled()
    expect(result.current.listening).toBe(false)
    expect(result.current.transcribing).toBe(false)
  })
})
