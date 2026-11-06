import { useEffect, useState } from 'react'

const TEXT_FIELD =
  'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range]), textarea, select, [contenteditable=true]'

const isTextField = (target: EventTarget | null) =>
  target instanceof Element && target.matches(TEXT_FIELD)

/**
 * True while a text field has focus, which is when the phone's keyboard is up. Browsers differ on whether the keyboard
 * shrinks the page or covers it, so the fixed bottom bar steps aside instead of riding on top of the keyboard.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onIn = (event: FocusEvent) => setOpen(isTextField(event.target))
    const onOut = (event: FocusEvent) => {
      if (!isTextField(event.relatedTarget)) setOpen(false)
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [])
  return open
}
