import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { useToast } from '@/shared/ui/toastContext'
import { useJoinGroup } from '../api/useGroups'
import { INVITE_CODE_PATTERN, normalizeInviteCode } from '../domain/group'

/** /unirse/:code. Asks for confirmation before joining; never joins on load. */
export function JoinGroupPage() {
  const { code: rawCode = '' } = useParams()
  const code = normalizeInviteCode(rawCode)
  const [error, setError] = useState<string | null>(null)
  const join = useJoinGroup()
  const navigate = useNavigate()
  const toast = useToast()

  async function confirm() {
    setError(null)
    try {
      const groupId = await join.mutateAsync(code)
      toast.show('¡Ya sos parte del grupo!', { mascotUrl: mascotGroup })
      navigate(`/grupos/${groupId}`, { replace: true })
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  if (!INVITE_CODE_PATTERN.test(code)) {
    return (
      <section className="px-4 pt-12">
        <EmptyState
          mascotUrl={mascotAlert}
          title="Ese link no es válido"
          description="El código de la invitación tiene que tener 12 letras o números. Pedí un link nuevo."
          action={
            <Link
              to="/grupos"
              className="flex h-14 items-center justify-center rounded-full bg-lime font-display text-lg font-semibold"
            >
              Ir a Grupos
            </Link>
          }
        />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3 px-4 pt-12">
      <h1 className="px-1 font-display text-[30px] font-bold leading-[34px]">Invitación</h1>
      <Card className="rounded-[28px] p-0">
        <EmptyState
          mascotUrl={mascotGroup}
          title="Te invitaron a un grupo"
          description="Al entrar vas a ver los gastos compartidos y tu saldo. Solo tu parte cuenta como gasto tuyo."
          action={
            <Button onClick={() => void confirm()} disabled={join.isPending}>
              {join.isPending ? 'Entrando…' : 'Unirme al grupo'}
            </Button>
          }
        />
        <p className="pb-5 text-center font-display text-lg font-semibold tracking-[0.25em] text-text-muted">
          {code}
        </p>
        {error && (
          <p role="alert" className="px-5 pb-5 text-center text-sm text-expense">
            {error}
          </p>
        )}
      </Card>
      <Link
        to="/grupos"
        className="flex min-h-11 items-center justify-center text-forest underline"
      >
        Ahora no
      </Link>
    </section>
  )
}
