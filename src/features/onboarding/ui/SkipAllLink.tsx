/**
 * "Omitir configuración": ends the whole onboarding with the defaults. It is a small underlined link, apart from the
 * step's own "Saltar", so skipping one optional step is never mistaken for leaving the setup.
 */
export function SkipAllLink({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-1 min-h-11 px-4 text-[14px] font-bold text-text-muted underline underline-offset-4 disabled:opacity-60"
    >
      Omitir configuración
    </button>
  )
}
