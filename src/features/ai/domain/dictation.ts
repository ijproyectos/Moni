/**
 * What the speech service returns is a list of results (finished phrases plus the one still being heard). Some browsers
 * (Chrome on Android with `continuous`) return each result already containing the previous ones, which would repeat the
 * words: a result that starts with everything said so far replaces it, one already contained is skipped, and the others are added.
 */
export function joinResults(parts: readonly string[]): string {
  let out = ''
  for (const raw of parts) {
    const part = raw.trim()
    if (part === '') continue
    if (out === '') out = part
    else if (part.startsWith(out)) out = part
    else if (out.endsWith(part)) continue
    else out = `${out} ${part}`
  }
  return out.replace(/\s+/g, ' ')
}

/** What was already written stays: the dictation goes after it, with one space between. */
export function mergeDictation(written: string, spoken: string): string {
  const base = written.replace(/\s+$/, '')
  const heard = spoken.trim()
  if (heard === '') return written
  return base === '' ? heard : `${base} ${heard}`
}
