import logoUrl from '@/assets/brand/logo_moni_mono-crema.svg'

export function AppSplashScreen() {
  return (
    <div
      role="status"
      aria-label="Cargando Moni"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-forest text-cream"
    >
      <img src={logoUrl} alt="Moni" className="h-16 w-auto" />
    </div>
  )
}
