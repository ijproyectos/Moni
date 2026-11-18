import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useUpdateProfile } from '@/features/auth/api/useUpdateProfile'
import { displayNameSchema } from '@/features/auth/domain/profile'
import { loadLocalPreferences } from '@/features/onboarding/domain/localPreferences'
import { toUserMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/ui/Button'
import { Page } from '@/shared/ui/kit'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'
import { useToast } from '@/shared/ui/toastContext'
import { updateProfileExtras } from '../mock/profileExtrasStore'
import { joinedLabel, useProfileIdentity } from './profileIdentity'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[12px] text-text-muted">{label}</span>
      {children}
    </div>
  )
}

/** Datos personales: photo, name (saved in Supabase), mail and currency (read only) and since when you are in Moni. */
export function PersonalDataPage() {
  const id = useProfileIdentity()
  const toast = useToast()
  const navigate = useNavigate()
  const update = useUpdateProfile()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const name = draft ?? id.saved
  const since = joinedLabel(id.createdAt)
  const localPrefs = id.user ? loadLocalPreferences(id.user.id) : null
  const usesUsd = (id.profile?.secondary_currency ?? localPrefs?.secondaryCurrency) === 'USD'

  function pick(file: File | undefined) {
    if (!file) return
    updateProfileExtras({ localPhotoUrl: URL.createObjectURL(file), photoRemoved: false })
    toast.show('Foto actualizada en este dispositivo')
  }

  async function save() {
    const parsed = displayNameSchema.safeParse(name)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisá el nombre.')
    setError(null)
    try {
      if (parsed.data !== id.saved) await update.mutateAsync(parsed.data)
      toast.show('Perfil actualizado')
      navigate('/perfil')
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <Page className="gap-4 pb-8 pt-5">
      <MentaHeader title="Datos personales" backTo="/perfil" />
      <div className="flex flex-col items-center gap-3">
        <PhotoOrInitial
          url={id.photo}
          initial={id.initial}
          alt="Tu foto de perfil"
          className="size-[76px]"
          fallbackClassName="bg-[#2B2A5C] font-display text-[30px] font-extrabold text-[#D9D4F5]"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="min-h-11 rounded-full bg-sand px-4 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
          >
            Cambiar foto
          </button>
          {id.photo && (
            <button
              type="button"
              onClick={() => updateProfileExtras({ localPhotoUrl: null, photoRemoved: true })}
              className="min-h-11 px-2 text-[13px] text-text-muted underline"
            >
              Quitar
            </button>
          )}
        </div>
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <div className="divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-card">
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Nombre"
            maxLength={60}
            className="min-h-8 bg-transparent text-[16px] font-bold outline-none"
          />
        </Field>
        <Field label="Mail">
          <input value={id.email} readOnly aria-label="Mail" className="min-h-8 bg-transparent text-[16px] font-bold text-text-muted outline-none" />
        </Field>
        <Field label="Moneda">
          <p className="min-h-8 text-[16px] font-bold">{usesUsd ? 'Peso argentino · $ · también dólares' : 'Peso argentino · $'}</p>
        </Field>
        {since && (
          <Field label="En Moni desde">
            <p className="min-h-8 text-[16px] font-bold">{since}</p>
          </Field>
        )}
      </div>

      <p className="px-1 text-[13px] leading-5 text-text-muted">
        Tus amigos y tu pareja te ven con este nombre y esta foto en los grupos. El mail es el de tu cuenta de Google. Tus
        datos son solo tuyos.
      </p>
      {error && (
        <p role="alert" className="text-center text-sm text-expense">
          {error}
        </p>
      )}
      <Button className="mt-2" onClick={() => void save()} disabled={update.isPending}>
        {update.isPending ? 'Guardando…' : 'Guardar cambios'}
      </Button>
    </Page>
  )
}
