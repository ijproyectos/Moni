/** What the file picker offers; the optimiser re-checks it because a picker filter is only a hint. */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
/** Anything bigger is refused before decoding it (phone photos are 2–8 MB). */
export const PHOTO_MAX_INPUT_BYTES = 15 * 1024 * 1024
/** Longest side of the stored picture: sharp on a phone cover (about 360 px at 3x) and small on disk. */
export const PHOTO_MAX_SIDE = 1080
/** The bucket refuses anything over 1 MB; aim well below so loading stays quick. */
export const PHOTO_TARGET_BYTES = 350 * 1024
export const PHOTO_HARD_LIMIT_BYTES = 1024 * 1024
const QUALITIES = [0.82, 0.72, 0.62, 0.5, 0.4]

/** `code` is one of photo_type | photo_too_big | photo_unreadable; toUserMessage turns it into Spanish. */
export class PhotoError extends Error {
  constructor(readonly code: 'photo_type' | 'photo_too_big' | 'photo_unreadable') {
    super(code)
    this.name = 'PhotoError'
  }
}

export function validatePhotoFile(file: Pick<File, 'type' | 'size'>): void {
  if (!ALLOWED_TYPES.has(file.type)) throw new PhotoError('photo_type')
  if (file.size > PHOTO_MAX_INPUT_BYTES) throw new PhotoError('photo_too_big')
  if (file.size === 0) throw new PhotoError('photo_unreadable')
}

/** Size that fits the longest side into `max`, never enlarging, keeping the aspect ratio. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** The browser parts, injectable so the logic can be tested without a canvas. */
export interface ImageCodec {
  decode(file: Blob): Promise<{ width: number; height: number; source: unknown }>
  encode(
    source: unknown,
    size: { width: number; height: number },
    quality: number,
  ): Promise<Blob | null>
}

const browserCodec: ImageCodec = {
  async decode(file) {
    try {
      // `from-image` applies the EXIF rotation, so a portrait phone photo is not stored sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { width: bitmap.width, height: bitmap.height, source: bitmap }
    } catch {
      throw new PhotoError('photo_unreadable')
    }
  },
  async encode(source, { width, height }, quality) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new PhotoError('photo_unreadable')
    // JPEG has no transparency: a PNG with a transparent background would turn black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  },
}

/**
 * A JPEG of at most PHOTO_MAX_SIDE px, without metadata (location, camera) because it is redrawn, and as light as
 * quality allows. Throws PhotoError for a file that is not a usable image.
 */
export async function optimizePhoto(file: File, codec: ImageCodec = browserCodec): Promise<Blob> {
  validatePhotoFile(file)
  const decoded = await codec.decode(file)
  if (!decoded.width || !decoded.height) throw new PhotoError('photo_unreadable')
  const size = fitWithin(decoded.width, decoded.height)
  let best: Blob | null = null
  for (const quality of QUALITIES) {
    const blob = await codec.encode(decoded.source, size, quality)
    if (!blob || blob.type !== 'image/jpeg') throw new PhotoError('photo_unreadable')
    best = blob
    if (blob.size <= PHOTO_TARGET_BYTES) break
  }
  if (!best || best.size > PHOTO_HARD_LIMIT_BYTES) throw new PhotoError('photo_too_big')
  return best
}
