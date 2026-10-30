// Client-side preparation of a receipt photo: decode, scale down, re-encode as JPEG. Re-encoding through a canvas
// drops EXIF (GPS, camera, timestamps) and fixes the orientation. Only the browser-specific bits live in `browserIo`;
// the rest is injectable so it can be tested without a canvas.

/** Longest side of the image sent to the model. Receipts stay legible and the payload stays small. */
export const MAX_SIDE = 1600
const QUALITY_STEPS = [0.8, 0.65, 0.5] as const
/** Server cap is 1.5 MB decoded; stay under it with a margin. */
export const MAX_ENCODED_BYTES = 1_400_000
/** Refuse absurd inputs before decoding them (a 40 MB photo can exhaust memory on cheap phones). */
export const MAX_INPUT_BYTES = 30 * 1024 * 1024

export type DownscaleErrorCode = 'not_an_image' | 'decode_failed' | 'too_large'

export class DownscaleError extends Error {
  constructor(readonly code: DownscaleErrorCode) {
    super(code)
    this.name = 'DownscaleError'
  }
}

export interface PreparedImage {
  /** Raw base64 (no `data:` prefix). */
  base64: string
  mediaType: 'image/jpeg'
  width: number
  height: number
  bytes: number
}

/** Target size keeping the aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE) {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width, height }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** `data:image/jpeg;base64,AAAA` -> `AAAA`. */
export function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
}

export interface DecodedImage {
  width: number
  height: number
  /** Encodes the image scaled to `width` x `height` as JPEG at `quality`. */
  encode: (width: number, height: number, quality: number) => Promise<Blob>
  release: () => void
}

export interface ImageIo {
  decode: (file: Blob) => Promise<DecodedImage>
  toBase64: (blob: Blob) => Promise<string>
}

export async function downscaleImage(file: Blob, io: ImageIo = browserIo): Promise<PreparedImage> {
  if (file.type !== '' && !file.type.startsWith('image/')) throw new DownscaleError('not_an_image')
  if (file.size > MAX_INPUT_BYTES) throw new DownscaleError('too_large')

  let decoded: DecodedImage
  try {
    decoded = await io.decode(file)
  } catch {
    throw new DownscaleError('decode_failed')
  }
  try {
    if (!(decoded.width > 0) || !(decoded.height > 0)) throw new DownscaleError('decode_failed')
    const { width, height } = fitWithin(decoded.width, decoded.height)
    for (const quality of QUALITY_STEPS) {
      const blob = await decoded.encode(width, height, quality)
      if (blob.size <= MAX_ENCODED_BYTES) {
        return {
          base64: await io.toBase64(blob),
          mediaType: 'image/jpeg',
          width,
          height,
          bytes: blob.size,
        }
      }
    }
    throw new DownscaleError('too_large')
  } catch (error) {
    if (error instanceof DownscaleError) throw error
    throw new DownscaleError('decode_failed')
  } finally {
    decoded.release()
  }
}

// ---------------------------------------------------------------------------------------------------------
// Browser implementation (canvas). Not unit-tested: jsdom has no canvas; covered by the manual device check.

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
    reader.readAsDataURL(blob)
  })
}

function loadViaImageElement(
  file: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () =>
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode_failed'))
    }
    img.src = url
  })
}

async function loadSource(file: Blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies the EXIF orientation while decoding, so the re-encoded JPEG is upright.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // Fall through to the <img> decoder.
    }
  }
  return loadViaImageElement(file)
}

export const browserIo: ImageIo = {
  async decode(file) {
    const { source, width, height, release } = await loadSource(file)
    return {
      width,
      height,
      release,
      encode: (w, h, quality) =>
        new Promise<Blob>((resolve, reject) => {
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('no_canvas'))
            return
          }
          // JPEG has no alpha: paint white so transparent PNG screenshots do not turn black.
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(source, 0, 0, w, h)
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
            'image/jpeg',
            quality,
          )
        }),
    }
  },
  async toBase64(blob) {
    return stripDataUrlPrefix(await blobToDataUrl(blob))
  },
}
