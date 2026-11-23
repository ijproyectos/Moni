import type { ReactNode } from 'react'
import { Page } from '@/shared/ui/kit'
import { MentaHeader } from '@/shared/ui/MentaHeader'

/** Shared shell for a legal/info page: reachable without estar logueado, so it never assumes AppShell. */
export function LegalLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Page className="gap-5 pb-10 pt-5">
      <MentaHeader title={title} subtitle={subtitle} fallbackTo="/" />
      <div className="flex flex-col gap-5 text-[15px] leading-6 text-ink">{children}</div>
    </Page>
  )
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-[17px] font-extrabold leading-6">{heading}</h2>
      <div className="flex flex-col gap-2 text-text-muted">{children}</div>
    </section>
  )
}
