import {
  applyTheme,
  parseThemeMode,
  readStoredThemeMode,
  resolveTheme,
  storeThemeMode,
  THEME_COLOR,
  THEME_STORAGE_KEY,
} from './theme'

describe('theme domain', () => {
  it('parses known modes and falls back to system for anything else', () => {
    expect(parseThemeMode('light')).toBe('light')
    expect(parseThemeMode('dark')).toBe('dark')
    expect(parseThemeMode('system')).toBe('system')
    for (const bad of [null, undefined, '', 'Dark', 'auto', 3, {}]) {
      expect(parseThemeMode(bad)).toBe('system')
    }
  })

  it('resolves explicit modes regardless of the OS and `system` through it', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('reads what was stored, and treats a throwing or missing storage as "not saved"', () => {
    expect(readStoredThemeMode({ getItem: () => 'dark' })).toBe('dark')
    expect(readStoredThemeMode({ getItem: () => null })).toBe('system')
    expect(readStoredThemeMode(null)).toBe('system')
    expect(
      readStoredThemeMode({
        getItem: () => {
          throw new DOMException('blocked', 'SecurityError')
        },
      }),
    ).toBe('system')
  })

  it('stores the mode under its key and reports failure instead of throwing', () => {
    const setItem = vi.fn()
    expect(storeThemeMode({ setItem }, 'light')).toBe(true)
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light')
    expect(
      storeThemeMode(
        {
          setItem: () => {
            throw new DOMException('full', 'QuotaExceededError')
          },
        },
        'dark',
      ),
    ).toBe(false)
    expect(storeThemeMode(null, 'dark')).toBe(false)
  })

  it('paints the dark class and the browser chrome color', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">'
    applyTheme('dark', document)
    expect(document.documentElement).toHaveClass('dark')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      THEME_COLOR.dark,
    )
    applyTheme('light', document)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      THEME_COLOR.light,
    )
  })

  it('does not fail when the page has no theme-color meta', () => {
    document.head.innerHTML = ''
    expect(() => applyTheme('dark', document)).not.toThrow()
  })
})
