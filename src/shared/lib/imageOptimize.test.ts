import {
  fitWithin,
  optimizePhoto,
  PHOTO_HARD_LIMIT_BYTES,
  PHOTO_MAX_INPUT_BYTES,
  PHOTO_MAX_SIDE,
  PHOTO_TARGET_BYTES,
  PhotoError,
  validatePhotoFile,
  type ImageCodec,
} from './imageOptimize'

const file = (type: string, size = 1000) => new File([new Uint8Array(size)], 'f', { type })
const jpeg = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })

function codec(width: number, height: number, sizeByQuality: (q: number) => number) {
  const encode = vi.fn<ImageCodec['encode']>(async (_source, _size, quality) =>
    jpeg(sizeByQuality(quality)),
  )
  const impl: ImageCodec = { decode: async () => ({ width, height, source: 'img' }), encode }
  return { impl, encode }
}

describe('validatePhotoFile', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(() => validatePhotoFile(file(type))).not.toThrow()
  })

  it.each(['image/gif', 'application/pdf', 'text/html', 'image/svg+xml', ''])(
    'refuses %s (photo_type)',
    (type) => {
      expect(() => validatePhotoFile(file(type))).toThrow(
        expect.objectContaining({ code: 'photo_type' }),
      )
    },
  )

  it('refuses a file over the limit (photo_too_big) and an empty one', () => {
    expect(() =>
      validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_INPUT_BYTES + 1 }),
    ).toThrow(expect.objectContaining({ code: 'photo_too_big' }))
    expect(() =>
      validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_INPUT_BYTES }),
    ).not.toThrow()
    expect(() => validatePhotoFile({ type: 'image/png', size: 0 })).toThrow(
      expect.objectContaining({ code: 'photo_unreadable' }),
    )
  })
})

describe('fitWithin', () => {
  it('shrinks the longest side keeping the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: PHOTO_MAX_SIDE, height: 810 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 810, height: PHOTO_MAX_SIDE })
  })

  it('never enlarges a small image', () => {
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 })
  })

  it('never returns a zero side for extreme panoramas', () => {
    expect(fitWithin(20000, 3).height).toBeGreaterThanOrEqual(1)
  })
})

describe('optimizePhoto', () => {
  it('re-encodes as a JPEG at the reduced size, at the best quality first', async () => {
    const { impl, encode } = codec(4000, 3000, () => 200 * 1024)
    const blob = await optimizePhoto(file('image/png'), impl)
    expect(blob.type).toBe('image/jpeg')
    expect(encode).toHaveBeenCalledTimes(1)
    expect(encode.mock.calls[0]?.[1]).toEqual({ width: PHOTO_MAX_SIDE, height: 810 })
    expect(encode.mock.calls[0]?.[2]).toBeCloseTo(0.82)
  })

  it('lowers the quality until the picture is light enough', async () => {
    const { impl, encode } = codec(2000, 2000, (q) => (q > 0.7 ? 900 * 1024 : 300 * 1024))
    const blob = await optimizePhoto(file('image/jpeg'), impl)
    expect(blob.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES)
    expect(encode.mock.calls.map((c) => c[2])).toEqual([0.82, 0.72, 0.62])
  })

  it('refuses a picture that is still over the hard limit at the lowest quality', async () => {
    const { impl } = codec(2000, 2000, () => PHOTO_HARD_LIMIT_BYTES + 1)
    await expect(optimizePhoto(file('image/jpeg'), impl)).rejects.toMatchObject({
      code: 'photo_too_big',
    })
  })

  it('refuses before decoding anything when the file type is not allowed', async () => {
    const decode = vi.fn()
    await expect(
      optimizePhoto(file('image/gif'), { decode, encode: vi.fn() }),
    ).rejects.toBeInstanceOf(PhotoError)
    expect(decode).not.toHaveBeenCalled()
  })

  it('treats an undecodable or empty image as unreadable', async () => {
    await expect(
      optimizePhoto(file('image/jpeg'), {
        decode: async () => {
          throw new PhotoError('photo_unreadable')
        },
        encode: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'photo_unreadable' })
    await expect(
      optimizePhoto(file('image/jpeg'), {
        decode: async () => ({ width: 0, height: 0, source: 1 }),
        encode: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'photo_unreadable' })
  })

  it('refuses an encoder that does not produce a JPEG (old browsers fall back to PNG)', async () => {
    const impl: ImageCodec = {
      decode: async () => ({ width: 10, height: 10, source: 1 }),
      encode: async () => new Blob([new Uint8Array(10)], { type: 'image/png' }),
    }
    await expect(optimizePhoto(file('image/jpeg'), impl)).rejects.toMatchObject({
      code: 'photo_unreadable',
    })
  })
})
