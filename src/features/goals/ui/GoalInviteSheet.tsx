import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { InviteCodeCard } from '@/shared/ui/InviteCodeCard'

interface GoalInviteSheetProps {
  /** Partner name, or null to invite a whole family/house. */
  partner: string | null
  code: string
  goalName?: string
  /** "before" = invite while creating (145/146); "after" = invite to an existing goal (147). */
  moment: 'before' | 'after'
  onClose: () => void
  onDone: () => void
}

// Screens 145 / 146 / 147 — Invitá a tu pareja / familia / a Caro con un código.
export function GoalInviteSheet({
  partner,
  code,
  goalName,
  moment,
  onClose,
  onDone,
}: GoalInviteSheetProps) {
  const who = partner ?? 'Cada persona'
  const title =
    moment === 'after' && partner
      ? `Invitá a ${partner} con un código`
      : partner
        ? 'Invitá a tu pareja'
        : 'Invitá a tu familia'
  const intro =
    moment === 'after' && partner
      ? `Con el código ${partner} ve la meta “${goalName ?? ''}” y aporta desde su app. Mientras tanto, la meta queda en pendiente.`
      : partner
        ? `Pasale el código o el link a ${partner}. Cuando entra, la meta se ve en las dos apps y se activa la pestaña “Compartidas”.`
        : 'Pasá el código o el link. Cada persona que entra ve la meta y aporta desde su app. Podés sumar a más gente después.'
  const link = `${window.location.origin}/unirse/${code}`

  return (
    <BottomSheet title={title} onClose={onClose}>
      <p className="text-[16px] leading-6">{intro}</p>
      <div className="mt-4">
        <InviteCodeCard
          code={code}
          description={`${who} lo escribe en Moni y entra a la meta.`}
          codeCaption="Código de la meta"
          link={link}
          shareText={`Sumate a mi meta en Moni con el código ${code}`}
        />
      </div>
      <p className="mt-3 text-[15px] leading-5 text-text-muted">
        Si {partner ?? 'alguien'} no tiene Moni, el link {partner ? 'la' : 'lo'} lleva a descargarla
        y entra directo.
      </p>
      <Button className="mt-4" onClick={onDone}>
        {moment === 'after' ? 'Listo' : 'Seguir con la meta'}
      </Button>
    </BottomSheet>
  )
}
