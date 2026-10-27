const AVATAR_COLORS = ['#f5b8b0', '#b8ec7c', '#ffc83d', '#a8dcd3', '#f3e8d2']

/** Stable pastel color for a person's name; "Vos" is always lime. */
const NAME_COLORS: Record<string, string> = {
  vos: '#b8ec7c',
  lu: '#f5b8b0',
  caro: '#f5b8b0',
  mati: '#ffc83d',
  fran: '#a8dcd3',
  nico: '#ffc83d',
}

export function avatarColor(name: string): string {
  const known = NAME_COLORS[name.trim().toLowerCase()]
  if (known) return known
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? '#f5b8b0'
}
