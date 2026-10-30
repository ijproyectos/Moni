import { THEME_STORAGE_KEY } from '../domain/theme'
import { createThemeStore } from './themeStore'

function fakeMedia(initial: boolean) {
  const listeners = new Set<() => void>()
  return {
    matches: initial,
    addEventListener: (_: 'change', l: () => void) => void listeners.add(l),
    removeEventListener: (_: 'change', l: () => void) => void listeners.delete(l),
    change(matches: boolean) {
      this.matches = matches
      listeners.forEach((l) => l())
    },
    count: () => listeners.size,
  }
}

function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial ? [[THEME_STORAGE_KEY, initial]] : [])
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

beforeEach(() => {
  document.documentElement.className = ''
  document.head.innerHTML = '<meta name="theme-color" content="#064735">'
})

describe('theme store', () => {
  it('defaults to system and follows the OS preference at start', () => {
    const store = createThemeStore({
      storage: memoryStorage(),
      media: fakeMedia(true),
      doc: document,
    })
    expect(store.getMode()).toBe('system')
    expect(store.getResolved()).toBe('dark')
    store.start()
    expect(document.documentElement).toHaveClass('dark')
  })

  it('restores the saved mode over the OS preference', () => {
    const store = createThemeStore({
      storage: memoryStorage('light'),
      media: fakeMedia(true),
      doc: document,
    })
    store.start()
    expect(store.getMode()).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('setMode persists, repaints and notifies subscribers', () => {
    const storage = memoryStorage()
    const store = createThemeStore({ storage, media: fakeMedia(false), doc: document })
    const listener = vi.fn()
    store.subscribe(listener)
    store.setMode('dark')
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0c1914')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('still works for this session when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const store = createThemeStore({ storage, media: fakeMedia(false), doc: document })
    expect(store.getMode()).toBe('system')
    expect(() => store.setMode('dark')).not.toThrow()
    expect(store.getMode()).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('works without storage and without matchMedia', () => {
    const store = createThemeStore({ storage: null, media: null, doc: document })
    store.start()
    expect(store.getResolved()).toBe('light')
    store.setMode('dark')
    expect(store.getResolved()).toBe('dark')
  })

  it('follows OS changes only while the mode is system', () => {
    const media = fakeMedia(false)
    const store = createThemeStore({ storage: memoryStorage(), media, doc: document })
    const listener = vi.fn()
    store.subscribe(listener)
    const stop = store.start()

    media.change(true)
    expect(document.documentElement).toHaveClass('dark')
    expect(listener).toHaveBeenCalledTimes(1)

    store.setMode('light')
    listener.mockClear()
    media.change(false)
    media.change(true)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(listener).not.toHaveBeenCalled()

    stop()
    expect(media.count()).toBe(0)
  })
})
