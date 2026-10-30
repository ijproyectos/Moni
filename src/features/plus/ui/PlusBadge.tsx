import { useState } from 'react'
import { usePlus } from '../api/usePlus'
import { plusBadgeText } from '../domain/plus'
import { PlusSheet } from './PlusSheet'

/** Small plan badge for Home: "Versión Free · sin suscripción" or "Moni Plus · hasta DD/MM". Opens the Plus sheet. */
export function PlusBadge() {
  const plus = usePlus()
  const [open, setOpen] = useState(false)
  // Nothing until the server has answered: no flash of "Free" for someone who is on Plus.
  if (!plus.isPlus && !plus.isFree) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-full bg-sand px-3 py-1 text-[14px] font-extrabold text-ink"
      >
        {plusBadgeText(plus.expiresAt)}
      </button>
      {open && <PlusSheet onClose={() => setOpen(false)} />}
    </>
  )
}
