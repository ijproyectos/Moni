import {
  DownscaleError,
  MAX_ENCODED_BYTES,
  MAX_INPUT_BYTES,
  MAX_SIDE,
  downscaleImage,
  fitWithin,
  stripDataUrlPrefix,
  type DecodedImage,
  type ImageIo,
} from './imageDownscale'

describe('fitWithin', () => {
  it('keeps small images as they are (no upscaling)', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(MAX_SIDE, 10)).toEqual({ width: MAX_SIDE, height: 10 })
  })

  it('scales the longest side down to 1600 keeping the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(8000, 3)).toEqual({ width: 1600, height: 1 })
  })
})

describe('stripDataUrlPrefix', () => {
  it('returns only the base64 part', () => {
    expect(stripDataUrlPrefix('data:image/jpeg;base64,QUJD')).toBe('QUJD')
    expect(stripDataUrlPrefix('QUJD')).toBe('QUJD')
  })
})

function fakeIo(options: {
  width?: number
  height?: number
  sizes?: number[]
  decodeFails?: boolean
}) {
  const encode = vi.fn<DecodedImage['encode']>(async () => {
    const size = options.sizes?.shift() ?? 1000
    return new Blob([new Uint8Array(size)])
  })
  const release = vi.fn()
  const decoded: DecodedImage = {
    width: options.width ?? 4000,
    height: options.height ?? 3000,
    encode,
    release,
  }
  const io: ImageIo = {
    decode: options.decodeFails
      ? vi.fn().mockRejectedValue(new Error('x'))
      : vi.fn().mockResolvedValue(decoded),
    toBase64: vi.fn().mockResolvedValue('QUJD'),
  }
  return { io, encode, release }
}

const file = (type = 'image/jpeg', size = 10) => new File([new Uint8Array(size)], 'f', { type })

describe('downscaleImage', () => {
  it('encodes a JPEG at 1600 px and quality 0.8 and releases the decoded image', async () => {
    const { io, encode, release } = fakeIo({})
    const result = await downscaleImage(file(), io)
    expect(encode).toHaveBeenCalledWith(1600, 1200, 0.8)
    expect(result).toMatchObject({
      base64: 'QUJD',
      mediaType: 'image/jpeg',
      width: 1600,
      height: 1200,
    })
    expect(release).toHaveBeenCalled()
  })

  it('lowers the quality while the result is over the size budget', async () => {
    const { io, encode } = fakeIo({ sizes: [MAX_ENCODED_BYTES + 1, MAX_ENCODED_BYTES + 1, 500] })
    await downscaleImage(file(), io)
    expect(encode.mock.calls.map((c) => c[2])).toEqual([0.8, 0.65, 0.5])
  })

  it('fails with too_large when no quality fits', async () => {
    const big = MAX_ENCODED_BYTES + 1
    const { io, release } = fakeIo({ sizes: [big, big, big] })
    await expect(downscaleImage(file(), io)).rejects.toMatchObject({ code: 'too_large' })
    expect(release).toHaveBeenCalled()
  })

  it('rejects non images and oversized inputs before decoding', async () => {
    const { io } = fakeIo({})
    await expect(downscaleImage(file('application/pdf'), io)).rejects.toMatchObject({
      code: 'not_an_image',
    })
    const huge = { type: 'image/jpeg', size: MAX_INPUT_BYTES + 1 } as Blob
    await expect(downscaleImage(huge, io)).rejects.toMatchObject({ code: 'too_large' })
    expect(io.decode).not.toHaveBeenCalled()
  })

  it('maps decoder failures and empty images to decode_failed', async () => {
    await expect(downscaleImage(file(), fakeIo({ decodeFails: true }).io)).rejects.toBeInstanceOf(
      DownscaleError,
    )
    await expect(downscaleImage(file(), fakeIo({ width: 0 }).io)).rejects.toMatchObject({
      code: 'decode_failed',
    })
  })
})
