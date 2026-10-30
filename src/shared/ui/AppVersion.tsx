/** Muted "Moni vX.Y.Z" line; the value comes from package.json via the Vite `define` build step. */
export function AppVersion() {
  return <p className="text-center text-[13px] text-text-muted">Moni v{__APP_VERSION__}</p>
}
