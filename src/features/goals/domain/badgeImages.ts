// Pictures of the badges, found by the badge key and not by anything the person writes. Drop a file named
// "<number>-<key>.svg" (preferred) or ".png" into src/assets/badges and it is picked up: no code changes.
const files = import.meta.glob('../../../assets/badges/*.{svg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const byKey = new Map<string, { url: string; svg: boolean }>()
for (const [path, url] of Object.entries(files)) {
  const match = /\/\d+-([a-z0-9-]+)\.(svg|png)$/.exec(path)
  if (!match) continue
  const key = match[1] as string
  const svg = match[2] === 'svg'
  const known = byKey.get(key)
  // A vector picture wins over the raster one when both exist.
  if (!known || (svg && !known.svg)) byKey.set(key, { url, svg })
}

/** The picture of a badge, or null while it is not in the project (the screens then draw a provisional one). */
export function badgeImage(key: string): string | null {
  return byKey.get(key)?.url ?? null
}
