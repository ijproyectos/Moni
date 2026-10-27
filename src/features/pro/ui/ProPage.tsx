import { useNavigate } from 'react-router'
import { useToast } from '@/shared/ui/toastContext'
import { ProPaywall } from './ProPaywall'

// Screen 013 reached from Más. Billing does not exist yet, so the trial is simulated.
export function ProPage() {
  const navigate = useNavigate()
  const toast = useToast()
  return (
    <ProPaywall
      onClose={() => navigate(-1)}
      onStartTrial={() => {
        toast.show('¡Listo! Tu prueba de Pro está activa (simulada)')
        navigate(-1)
      }}
    />
  )
}
