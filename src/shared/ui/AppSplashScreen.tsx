import logoUrl from '@/assets/brand/logo_moni_mono-crema.svg'
import catUrl from '@/assets/mascot/moni-gato-fortuna-animado.svg'

export function AppSplashScreen() {
  return (
    <div
      role="status"
      aria-label="Cargando Moni"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-forest text-cream"
    >
      <img src={catUrl} alt="" className="h-28 w-28" />
      <img src={logoUrl} alt="Moni" className="h-16 w-auto" />
    </div>
  )
}
