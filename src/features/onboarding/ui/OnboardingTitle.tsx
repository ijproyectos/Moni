/** Centered heading used by every onboarding step. */
export function OnboardingTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <h1 className="mt-7 text-balance text-center font-display text-[30px] font-extrabold leading-9 text-ink">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-3 text-balance text-center text-[15px] leading-[22px] text-text-muted">
          {subtitle}
        </p>
      )}
    </>
  )
}
