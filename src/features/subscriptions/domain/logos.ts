// Brand logos are separate SVG files (never inlined, never fetched from outside). Importing them as URLs
// only builds the map: a file is requested by the browser when an <img> that uses it is rendered.
const files = import.meta.glob<string>('/src/assets/brands/*.{svg,png}', {
  eager: true,
  query: '?no-inline',
  import: 'default',
})

const URLS = new Map(
  Object.entries(files).map(([path, url]) => [
    path
      .split('/')
      .pop()
      ?.replace(/\.(svg|png)$/, '') ?? path,
    url,
  ]),
)

/** URL of the logo with that file name, or undefined (the UI then shows the generic icon). */
export function logoUrl(logo: string | undefined): string | undefined {
  return logo ? URLS.get(logo) : undefined
}
