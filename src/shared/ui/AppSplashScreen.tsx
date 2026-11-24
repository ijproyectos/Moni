import logoUrl from '@/assets/brand/logo_moni_mono-crema.svg'
import catFaceUrl from '@/assets/mascot/moni-gato-cara.svg'

export function AppSplashScreen() {
  return (
    <div
      role="status"
      aria-label="Cargando Moni"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-forest text-cream"
    >
      <img src={catFaceUrl} alt="" className="h-44 w-44" />
      <img src={logoUrl} alt="Moni" className="h-16 w-auto" />
    </div>
  )
}
