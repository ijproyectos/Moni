import { listGroupPhotos, removeGroupPhoto, uploadGroupPhoto } from './photosRepository'

const sb = vi.hoisted(() => ({
  rows: [] as { id: string; photo_path: string | null }[],
  calls: [] as string[],
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrls: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        not: async () => ({ data: sb.rows.filter((r) => r.photo_path), error: null }),
      }),
    }),
    rpc: sb.rpc,
    storage: {
      from: (bucket: string) => ({
        bucket,
        upload: sb.upload,
        remove: sb.remove,
        createSignedUrls: sb.createSignedUrls,
      }),
    },
  }),
}))

const G = '11111111-1111-4111-8111-111111111111'
const image = new Blob([new Uint8Array(10)], { type: 'image/jpeg' })

beforeEach(() => {
  sb.rows = []
  sb.calls = []
  sb.upload.mockReset().mockImplementation(async () => (sb.calls.push('upload'), { error: null }))
  sb.remove.mockReset().mockImplementation(async () => (sb.calls.push('remove'), { error: null }))
  sb.rpc
    .mockReset()
    .mockImplementation(async () => (sb.calls.push('rpc'), { data: null, error: null }))
  sb.createSignedUrls.mockReset()
})

describe('photosRepository', () => {
  it('lists the signed links of the groups that have a photo, by group id', async () => {
    sb.rows = [
      { id: 'g1', photo_path: 'g1/a.jpg' },
      { id: 'g2', photo_path: null },
      { id: 'g3', photo_path: 'g3/c.jpg' },
    ]
    sb.createSignedUrls.mockResolvedValue({
      data: [
        { path: 'g1/a.jpg', signedUrl: 'https://s/a?t=1', error: null },
        { path: 'g3/c.jpg', signedUrl: 'https://s/c?t=1', error: null },
      ],
      error: null,
    })
    expect(await listGroupPhotos()).toEqual({
      g1: { path: 'g1/a.jpg', url: 'https://s/a?t=1' },
      g3: { path: 'g3/c.jpg', url: 'https://s/c?t=1' },
    })
    expect(sb.createSignedUrls).toHaveBeenCalledWith(['g1/a.jpg', 'g3/c.jpg'], 86_400)
  })

  it('asks for no links at all when nobody has a photo (existing groups)', async () => {
    sb.rows = [{ id: 'g1', photo_path: null }]
    expect(await listGroupPhotos()).toEqual({})
    expect(sb.createSignedUrls).not.toHaveBeenCalled()
  })

  it('uploads to a new object in the group folder, then points the group at it', async () => {
    await uploadGroupPhoto(G, image)
    const [path, body, options] = sb.upload.mock.calls[0] ?? []
    expect(path).toMatch(new RegExp(`^${G}/[0-9a-f-]{36}\\.jpg$`))
    expect(body).toBe(image)
    expect(options).toMatchObject({ contentType: 'image/jpeg', upsert: false })
    expect(sb.rpc).toHaveBeenCalledWith('set_group_photo', { p_group: G, p_path: path })
    expect(sb.calls).toEqual(['upload', 'rpc'])
  })

  it('replacing deletes the previous file only after the group points at the new one', async () => {
    sb.rpc.mockImplementation(
      async () => (sb.calls.push('rpc'), { data: `${G}/old.jpg`, error: null }),
    )
    await uploadGroupPhoto(G, image)
    expect(sb.calls).toEqual(['upload', 'rpc', 'remove'])
    expect(sb.remove).toHaveBeenCalledWith([`${G}/old.jpg`])
  })

  it('two uploads never share an address (a replaced photo is never served from cache)', async () => {
    await uploadGroupPhoto(G, image)
    await uploadGroupPhoto(G, image)
    expect(sb.upload.mock.calls[0]?.[0]).not.toBe(sb.upload.mock.calls[1]?.[0])
  })

  it('when pointing the group fails, the new file is removed and the error surfaces', async () => {
    sb.rpc.mockImplementation(
      async () => (sb.calls.push('rpc'), { data: null, error: new Error('not_group_member') }),
    )
    await expect(uploadGroupPhoto(G, image)).rejects.toThrow('not_group_member')
    expect(sb.remove).toHaveBeenCalledWith([sb.upload.mock.calls[0]?.[0]])
  })

  it('does not call the database when the upload itself fails', async () => {
    sb.upload.mockResolvedValue({ error: new Error('too big') })
    await expect(uploadGroupPhoto(G, image)).rejects.toThrow('too big')
    expect(sb.rpc).not.toHaveBeenCalled()
  })

  it('removing clears the photo and deletes the file once', async () => {
    sb.rpc.mockResolvedValue({ data: `${G}/old.jpg`, error: null })
    await removeGroupPhoto(G)
    expect(sb.rpc).toHaveBeenCalledWith('set_group_photo', { p_group: G, p_path: null })
    expect(sb.remove).toHaveBeenCalledTimes(1)
    expect(sb.remove).toHaveBeenCalledWith([`${G}/old.jpg`])
  })

  it('removing a group without photo deletes nothing', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null })
    await removeGroupPhoto(G)
    expect(sb.remove).not.toHaveBeenCalled()
  })
})
