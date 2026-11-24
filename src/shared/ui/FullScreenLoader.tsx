export function FullScreenLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-forest text-cream"
    >
      <span
        aria-hidden="true"
        className="size-10 animate-spin rounded-full border-4 border-surface border-t-lime"
      />
      <span className="font-body text-[15px] text-text-muted-on-dark">{label}</span>
    </div>
  )
}
