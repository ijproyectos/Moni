export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-4 bg-forest px-6 text-cream">
      <h1 className="font-display text-3xl font-semibold">Falta configurar Moni</h1>
      <p className="text-[15px] leading-[22px] text-text-muted-on-dark">
        No encontramos estas variables de entorno. Copiá <code>.env.example</code> a{' '}
        <code>.env.local</code> y completalas:
      </p>
      <ul className="list-disc pl-5 font-mono text-sm">
        {missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </main>
  )
}
