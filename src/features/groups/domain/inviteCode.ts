/** Formats a 12-char invite code in blocks of 4 so it is easier to read aloud. */
export function prettyCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-')
}
