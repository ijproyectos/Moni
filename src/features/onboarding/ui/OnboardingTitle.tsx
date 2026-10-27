/** Centered heading used by every onboarding step (dark surface). */
export function OnboardingTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <h1 className="mt-7 text-center font-display text-[32px] font-extrabold leading-[38px] text-cream">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-3 text-center text-[16px] leading-6 text-text-muted-on-dark">{subtitle}</p>
      )}
    </>
  )
}
