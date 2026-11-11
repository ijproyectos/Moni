import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { GroupDetailHeader } from './GroupDetailHeader'
import { GroupKindTile } from './GroupKindIcon'
import { GroupPhotoEditor } from './GroupPhotoEditor'
import { GroupPhotoPicker } from './GroupPhotoPicker'
import { GroupsScreen, type ListedGroup } from './GroupsScreen'

const state = vi.hoisted(() => ({
  photos: {} as Record<string, { path: string; url: string }>,
  set: vi.fn(),
  remove: vi.fn(),
  optimize: vi.fn(),
}))

vi.mock('../api/useGroupPhotos', () => ({
  useGroupPhoto: (id: string) => state.photos[id]?.url ?? null,
  useSetGroupPhoto: () => ({ mutateAsync: state.set, isPending: false }),
  useRemoveGroupPhoto: () => ({ mutateAsync: state.remove, isPending: false }),
}))
vi.mock('@/shared/lib/imageOptimize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/imageOptimize')>()),
  optimizePhoto: state.optimize,
}))

const png = new File([new Uint8Array(2000)], 'foto.png', { type: 'image/png' })
const optimized = new Blob([new Uint8Array(50)], { type: 'image/jpeg' })

beforeEach(() => {
  state.photos = {}
  state.set.mockReset().mockResolvedValue(undefined)
  state.remove.mockReset().mockResolvedValue(undefined)
  state.optimize.mockReset().mockResolvedValue(optimized)
})

const group = (over: Partial<ListedGroup> = {}): ListedGroup => ({
  id: 'g1',
  name: 'Casa',
  kind: 'casa',
  role: 'owner',
  memberCount: 3,
  myNetCents: 25_000_00,
  lastActivity: '2026-10-01T00:00:00Z',
  peopleCount: 3,
  ...over,
})

function renderList(groups: ListedGroup[]) {
  render(
    <MemoryRouter>
      <GroupsScreen
        groups={groups}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        onNewGroup={vi.fn()}
      />
    </MemoryRouter>,
  )
}

describe('Fotos de grupos: en la lista', () => {
  it('shows the photo in place of the icon, with the same tile and rounded corners', () => {
    renderList([
      group({ photoUrl: 'https://s/casa.jpg' }),
      group({ id: 'g2', name: 'Brasil', kind: 'viaje' }),
    ])
    const [first, second] = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.startsWith('/grupos/g'))
    const photo = (first as HTMLElement).querySelector('img') as HTMLImageElement
    expect(photo).toHaveAttribute('src', 'https://s/casa.jpg')
    // Same tile as the icon tile of the group without photo (round 42px circle).
    const tile = photo.parentElement as HTMLElement
    const iconTile = (second as HTMLElement).querySelector(
      'span[aria-hidden="true"]',
    ) as HTMLElement
    for (const cls of ['size-[42px]', 'rounded-full', 'shrink-0']) {
      expect(tile).toHaveClass(cls)
      expect(iconTile).toHaveClass(cls)
    }
    expect((second as HTMLElement).querySelector('img')).toBeNull()
  })

  it('keeps the name, kind, people and balance of the card unchanged', () => {
    renderList([group({ photoUrl: 'https://s/casa.jpg' })])
    const card = screen.getByRole('link', { name: /Casa/ })
    expect(card).toHaveTextContent('Casa')
    expect(card).toHaveTextContent('3 personas')
    expect(card).toHaveTextContent('te deben')
    expect(card).toHaveTextContent('$25.000')
  })

  it('a group that never had a photo (existing groups) keeps its icon', () => {
    renderList([group()])
    expect(document.querySelector('img')).toBeNull()
  })

  it('goes back to the icon when the picture fails to load', () => {
    const { container } = render(<GroupKindTile kind="casa" photoUrl="https://s/rota.jpg" />)
    container.querySelector('img')?.dispatchEvent(new Event('error'))
    return waitFor(() => expect(container.querySelector('img')).toBeNull())
  })
})

describe('Fotos de grupos: encabezado del detalle', () => {
  function header(photoUrl: string | null, kind: 'viaje' | 'pareja' = 'viaje') {
    const handlers = { onBack: vi.fn(), onInvite: vi.fn(), onOptions: vi.fn() }
    const view = render(
      <GroupDetailHeader
        name="Viaje a Brasil"
        kind={kind}
        photoUrl={photoUrl}
        extra={<span>avatares</span>}
        {...handlers}
      />,
    )
    return { ...view, ...handlers }
  }

  it('with a photo: a small rounded square next to the name, no big cover', () => {
    const { container } = header('https://s/brasil.jpg')
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://s/brasil.jpg')
    const tile = img?.parentElement as HTMLElement
    expect(tile).toHaveClass('size-11', 'rounded-[12px]')
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Viaje a Brasil' })).toBeInTheDocument()
  })

  it('keeps back on the left and invite / options on the right, all working', async () => {
    const { onBack, onInvite, onOptions, container } = header('https://s/brasil.jpg')
    const buttons = [...container.querySelectorAll('button')].map((b) =>
      b.getAttribute('aria-label'),
    )
    expect(buttons).toEqual(['Volver', 'Invitar', 'Opciones del grupo'])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    await user.click(screen.getByRole('button', { name: 'Invitar' }))
    await user.click(screen.getByRole('button', { name: 'Opciones del grupo' }))
    expect([onBack, onInvite, onOptions].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])
  })

  it('a long name wraps to two lines instead of pushing the buttons out', () => {
    header('https://s/brasil.jpg')
    expect(screen.getByRole('heading')).toHaveClass('line-clamp-2')
  })

  it('without a photo the header is the original one: no tile, single-line name, couple avatars kept', () => {
    const { container } = header(null, 'pareja')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('span[aria-hidden="true"]')).toBeNull()
    expect(screen.getByRole('heading')).toHaveClass('truncate', 'text-[28px]')
    expect(screen.getByText('avatares')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver' })).toHaveClass('size-12')
  })

  it('with a photo the couple avatars give way (the people are listed below anyway)', () => {
    header('https://s/p.jpg', 'pareja')
    expect(screen.queryByText('avatares')).toBeNull()
  })

  it('falls back to the icon tile when the picture fails to load', async () => {
    const { container } = header('https://s/rota.jpg')
    container.querySelector('img')?.dispatchEvent(new Event('error'))
    await waitFor(() => expect(container.querySelector('img')).toBeNull())
    expect(container.querySelector('svg.lucide, span[aria-hidden="true"] svg')).not.toBeNull()
  })
})

describe('GroupPhotoPicker', () => {
  function setup(photoUrl: string | null, busy = false) {
    const onPick = vi.fn()
    const onRemove = vi.fn()
    render(
      <GroupPhotoPicker
        kind="amigos"
        photoUrl={photoUrl}
        busy={busy}
        onPick={onPick}
        onRemove={onRemove}
      />,
    )
    return { onPick, onRemove, user: userEvent.setup() }
  }

  it('offers "Agregar foto" and no remove button when there is no photo', () => {
    setup(null)
    expect(screen.getByRole('button', { name: 'Agregar foto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).toBeNull()
  })

  it('offers "Cambiar foto" and "Quitar foto" when there is one', async () => {
    const { user, onRemove } = setup('https://s/a.jpg')
    expect(screen.getByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('opens the gallery / files with only the allowed image types', () => {
    setup(null)
    expect(screen.getByLabelText('Elegir foto del grupo')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    )
  })

  it('hands the chosen file over', async () => {
    const { user, onPick } = setup(null)
    await user.upload(screen.getByLabelText('Elegir foto del grupo'), png)
    expect(onPick).toHaveBeenCalledWith(png)
  })

  it('is disabled while uploading', () => {
    setup('https://s/a.jpg', true)
    expect(screen.getByRole('button', { name: 'Subiendo…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Quitar foto' })).toBeDisabled()
  })
})

describe('GroupPhotoEditor (grupo existente)', () => {
  function setup(photoUrl?: string) {
    if (photoUrl) state.photos = { g1: { path: 'g1/a.jpg', url: photoUrl } }
    render(
      <ToastProvider>
        <GroupPhotoEditor groupId="g1" kind="viaje" />
      </ToastProvider>,
    )
    return userEvent.setup()
  }

  it('uploads: optimises the file first and saves the optimised image', async () => {
    const user = setup()
    await user.upload(screen.getByLabelText('Elegir foto del grupo'), png)
    await waitFor(() => expect(state.set).toHaveBeenCalledTimes(1))
    expect(state.optimize).toHaveBeenCalledWith(png)
    expect(state.set).toHaveBeenCalledWith({ groupId: 'g1', image: optimized })
    expect(await screen.findByText('Foto agregada')).toBeInTheDocument()
  })

  it('replaces: says so and uploads the new one', async () => {
    const user = setup('https://s/a.jpg')
    await user.upload(screen.getByLabelText('Elegir foto del grupo'), png)
    expect(await screen.findByText('Foto cambiada')).toBeInTheDocument()
    expect(state.set).toHaveBeenCalledTimes(1)
  })

  it('removes the photo, once', async () => {
    const user = setup('https://s/a.jpg')
    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith('g1'))
    expect(state.remove).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Foto quitada')).toBeInTheDocument()
  })

  it('a refused file shows a clear message and uploads nothing', async () => {
    const { PhotoError } = await import('@/shared/lib/imageOptimize')
    state.optimize.mockRejectedValue(new PhotoError('photo_type'))
    const user = setup()
    await user.upload(screen.getByLabelText('Elegir foto del grupo'), png)
    expect(await screen.findByText('Elegí una imagen JPG, PNG o WebP.')).toBeInTheDocument()
    expect(state.set).not.toHaveBeenCalled()
  })

  it('a failed upload (for example somebody who already left the group) is reported', async () => {
    state.set.mockRejectedValue(new Error('not_group_member'))
    const user = setup()
    await user.upload(screen.getByLabelText('Elegir foto del grupo'), png)
    expect(await screen.findByText('No sos parte de este grupo.')).toBeInTheDocument()
  })
})
