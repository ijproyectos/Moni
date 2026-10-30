import type { ReactNode } from 'react'

/** Temporary page body for tabs whose real features land in later sprints. Shows no fake data. */
export function ComingSoonPage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="px-5 pt-14">
      <h1 className="font-display text-[30px] font-bold leading-[34px]">{title}</h1>
      {children}
      <p className="mt-6 rounded-xl border border-cream bg-card p-5 text-[15px] leading-[22px] text-text-muted">
        Esta sección la armamos en el próximo sprint.
      </p>
    </section>
  )
}
