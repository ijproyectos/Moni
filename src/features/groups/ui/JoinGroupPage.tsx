import { Bell, ClipboardPaste, Gift, Lock, Search, Sparkles, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import iconUrl from '@/assets/brand/icono_app_redondeado.svg'
import { useProfile } from '@/features/auth/api/useProfile'
import { firstName } from '@/features/auth/domain/profile'
import { toUserMessage } from '@/shared/lib/errors'
import { FEATURES } from '@/shared/config/features'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { Avatar, MoniSays, Page, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { PageHeader } from '@/shared/ui/PageHeader'
import { useInvitePreview } from '../api/useInvitePreview'
import { useJoinGroup } from '../api/useGroups'
import {
  cleanCodeInput,
  extractInviteCode,
  INVITE_CODE_PATTERN,
  normalizeInviteCode,
} from '../domain/group'
import { prettyCode } from '../domain/inviteCode'
import { restoreGroupOverlay } from '../mock/overlayStore'

function MascotTile({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'mx-auto flex items-center justify-center rounded-[28px] bg-cream',
        size === 'lg' ? 'size-52' : 'h-28 w-40',
      )}
    >
      <img src={mascotGroup} alt="" className={size === 'lg' ? 'size-44' : 'h-24'} />
    </span>
  )
}

// Screens 119 / 120 / 123 — Entrar con un código.
export function JoinWithCodePage() {
  const navigate = useNavigate()
  const back = (useLocation().state ?? {}) as { code?: string; notFound?: boolean }
  // Links like /grupos/unirse?codigo=ABCD-EFGH prefill the code.
  const [params] = useSearchParams()
  const [code, setCode] = useState(back.code ?? cleanCodeInput(params.get('codigo') ?? ''))
  const [notFound, setNotFound] = useState(Boolean(back.notFound))
  const valid = INVITE_CODE_PATTERN.test(code)

  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      setCode(extractInviteCode(text))
      setNotFound(false)
    } catch {
      // Clipboard blocked: the person types it.
    }
  }

  return (
    <Page className="pb-28">
      <PageHeader title="Entrar con un código" fallbackTo="/grupos" />
      <MascotTile />
      <h2 className="text-center font-display text-[26px] font-extrabold leading-8">
        Pegá el código que te mandaron
      </h2>
      <p className="-mt-2 text-center text-[16px] leading-6 text-text-muted">
        Lo tiene quien armó el grupo: está en Personas, en “Código del grupo”.
      </p>
      <input
        type="text"
        aria-label="Código del grupo"
        placeholder="XXXX-XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={prettyCode(code)}
        onChange={(e) => {
          // A pasted link or message is searched for its code; typing is just cleaned (max 12).
          setCode(
            /[/:]/.test(e.target.value)
              ? extractInviteCode(e.target.value)
              : cleanCodeInput(e.target.value),
          )
          setNotFound(false)
        }}
        aria-invalid={notFound || undefined}
        className={cn(
          'mx-auto h-[72px] w-full rounded-[22px] border-2 bg-card text-center font-display text-[28px] font-extrabold uppercase tracking-[0.12em] placeholder:text-placeholder',
          notFound ? 'border-expense bg-blush/20 text-expense' : 'border-sand',
        )}
      />
      {notFound ? (
        <>
          <p role="alert" className="flex gap-2 text-[15px] leading-5 text-expense">
            <Bell aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            No encontramos ese código o ya venció. Revisá que esté completo o pedile uno nuevo a
            quien te invitó.
          </p>
          <button
            type="button"
            onClick={() => {
              setCode('')
              setNotFound(false)
            }}
            className="mx-auto min-h-11 text-[17px] font-extrabold"
          >
            Pegar otro código
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void paste()}
          className="mx-auto flex min-h-12 items-center gap-2 rounded-full bg-forest px-6 text-[17px] font-extrabold text-cream"
        >
          <ClipboardPaste aria-hidden="true" className="size-5" /> Pegar código
        </button>
      )}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button
          disabled={!valid}
          onClick={() => navigate(`/unirse/${code}`)}
          className="disabled:bg-lime/40"
        >
          <Search aria-hidden="true" className="mr-2 size-5" /> Buscar grupo
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {valid ? 'Código completo' : ''}
      </span>
    </Page>
  )
}

// Screens 121 / 122 — Entrar al grupo (confirmación) y listo. Never joins on load.
export function JoinGroupPage() {
  const { code: rawCode = '' } = useParams()
  const code = normalizeInviteCode(rawCode)
  const navigate = useNavigate()
  const join = useJoinGroup()
  const validCode = INVITE_CODE_PATTERN.test(code)
  const preview = useInvitePreview(code, validCode)
  const toast = useToast()
  const { data: profile } = useProfile()
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState<{ id: string; alreadyMember: boolean } | null>(null)
  const me = firstName(profile?.display_name) || 'Vos'

  if (!validCode) {
    return (
      <Page>
        <PageHeader title="Entrar al grupo" fallbackTo="/grupos" />
        <p role="alert" className="text-[16px] text-expense">
          Ese link no es válido. El código tiene 8 letras o números: pedí uno nuevo.
        </p>
        <Link to="/grupos/unirse" className="text-[17px] font-extrabold underline">
          Escribir el código
        </Link>
      </Page>
    )
  }

  if (joined) {
    return (
      <Page className="pb-28 pt-24">
        <MascotTile size="lg" />
        <h1 className="text-center font-display text-[30px] font-extrabold">
          {joined.alreadyMember ? 'Ya sos parte de este grupo' : 'Ya estás en el grupo'}
        </h1>
        <p className="text-center text-[16px] leading-6 text-text-muted">
          {joined.alreadyMember
            ? 'No hizo falta usar el código otra vez: tu lugar ya estaba. Abrí el grupo para seguir.'
            : 'Ven tus gastos y vos los de ellos. Todos pueden editar y Moni te avisa cada cambio.'}
        </p>
        {FEATURES.referral && (
          <Link
            to="/recomendar"
            className="flex items-center gap-3 rounded-[22px] bg-lime/30 px-4 py-3"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-card">
              <Gift aria-hidden="true" className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block text-[17px] font-extrabold">¿Tenés amigos sin Moni?</span>
              <span className="block text-[15px]">Recomendala y ganen 2 meses de Pro.</span>
            </span>
          </Link>
        )}
        <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <Button onClick={() => navigate(`/grupos/${joined.id}`, { replace: true })}>
            <UsersRound aria-hidden="true" className="mr-2 size-5" /> Ver el grupo
          </Button>
        </div>
      </Page>
    )
  }

  // The server says this code is not valid right now (unknown, expired, revoked or used up): say it before asking anything.
  if (preview.data?.status === 'invalid') {
    return (
      <Page>
        <PageHeader title="Entrar al grupo" fallbackTo="/grupos/unirse" />
        <p role="alert" className="flex gap-2 text-[16px] leading-6 text-expense">
          <Bell aria-hidden="true" className="mt-1 size-4 shrink-0" />
          Ese código no existe o ya venció. Revisá que esté completo o pedile uno nuevo a quien te
          invitó.
        </p>
        <Link
          to="/grupos/unirse"
          state={{ code, notFound: true }}
          className="text-[17px] font-extrabold underline"
        >
          Probar con otro código
        </Link>
      </Page>
    )
  }

  const groupName = preview.data?.status === 'found' ? preview.data.groupName : null

  async function confirm() {
    setError(null)
    try {
      const result = await join.mutateAsync(code)
      restoreGroupOverlay(result.groupId)
      setJoined({ id: result.groupId, alreadyMember: result.alreadyMember })
      if (!result.alreadyMember) {
        const own = firstName(profile?.display_name)
        toast.show(own ? `¡${own} se unió al grupo!` : '¡Te sumaste al grupo!')
      }
    } catch (e) {
      const message = toUserMessage(e)
      // An unknown, expired, revoked or used-up code goes back to the code screen (123); other
      // errors (offline, session expired, too many attempts) stay here with their own message.
      if (e instanceof Error && /^invite_(invalid|expired|revoked|exhausted)$/.test(e.message)) {
        navigate('/grupos/unirse', { replace: true, state: { code, notFound: true } })
      } else {
        setError(message)
      }
    }
  }

  return (
    <Page className="pb-28">
      <PageHeader title="Entrar al grupo" fallbackTo="/grupos/unirse" />
      <section className="flex flex-col items-center rounded-[28px] bg-forest px-4 py-6 text-center text-cream">
        <span className="flex size-16 items-center justify-center rounded-full bg-lime text-forest">
          <UsersRound aria-hidden="true" className="size-7" />
        </span>
        <p className="mt-3 text-[16px] text-text-muted-on-dark">Te invitaron a:</p>
        <p className="mt-1 max-w-full break-words font-display text-[30px] font-extrabold leading-9">
          {groupName ?? (preview.isLoading ? 'Buscando el grupo…' : 'un grupo')}
        </p>
      </section>
      <SectionLabel>Vas a entrar como</SectionLabel>
      <div className="flex items-center gap-3 rounded-[22px] border border-sand bg-card px-4 py-3">
        <Avatar name={me} size="lg" />
        <span className="flex-1">
          <span className="block text-[18px] font-extrabold">{me}</span>
          <span className="block text-[15px] text-text-muted">Con tu cuenta de Moni</span>
        </span>
        <span className="rounded-full bg-lime/40 px-3 py-0.5 text-[13px] font-extrabold">
          Tiene Moni
        </span>
      </div>
      {FEATURES.referral && (
        <MoniSays
          lead={null}
          icon={<Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
        >
          Ves los gastos del grupo y todos pueden editarlos. Moni te avisa cada cambio. Solo tu
          parte cuenta como gasto tuyo.
        </MoniSays>
      )}
      {error && (
        <p role="alert" className="text-center text-[15px] text-expense">
          {error}
        </p>
      )}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button onClick={() => void confirm()} disabled={join.isPending || preview.isLoading}>
          {join.isPending ? 'Sumándome…' : 'Sumarme al grupo'}
        </Button>
      </div>
    </Page>
  )
}

// Screen 127 — Lo que ve quien no tiene Moni al abrir un link de grupo (public page).
export function GroupLinkLandingPage() {
  const { code = '' } = useParams()
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center gap-4 bg-canvas px-6 pb-10 pt-10 text-center text-ink">
      <span className="flex items-center gap-2 rounded-full border border-sand bg-card px-4 py-1.5 text-[15px]">
        <Lock aria-hidden="true" className="size-4" /> moni.app
      </span>
      <img src={iconUrl} alt="Moni" className="mt-4 size-24" />
      <h1 className="font-display text-[30px] font-extrabold leading-9">
        Te invitaron a un grupo en Moni
      </h1>
      <p className="text-[17px] leading-6 text-text-muted">
        Para entrar al grupo necesitás Moni. Creá tu cuenta gratis y entrás directo, con tus gastos
        ya cargados.
      </p>
      <Link
        to={`/unirse/${code}`}
        className="flex h-14 w-full items-center justify-center rounded-full bg-lime text-[18px] font-extrabold"
      >
        Descargar para iPhone
      </Link>
      <Link
        to={`/unirse/${code}`}
        className="flex h-14 w-full items-center justify-center rounded-full border-2 border-sand bg-card text-[18px] font-extrabold"
      >
        Descargar para Android
      </Link>
      <MoniSays
        lead={null}
        icon={<Gift aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
        className="text-left"
      >
        Si te registrás con este link, vos y quien te invitó ganan{' '}
        <strong className="font-extrabold">2 meses de Moni Pro</strong>.
      </MoniSays>
      <Link to={`/unirse/${code}`} className="min-h-11 text-[17px] font-extrabold">
        Ya tengo Moni · entrar con un código
      </Link>
    </main>
  )
}
