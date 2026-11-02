import { getSupabase } from '@/shared/lib/supabase'

export const GROUP_PHOTOS_BUCKET = 'group-photos'
/** Signed links last a day; the app asks for fresh ones every time it opens, so this only covers a long session. */
export const PHOTO_URL_SECONDS = 24 * 60 * 60

export interface GroupPhoto {
  path: string
  /** Short-lived signed link: the bucket is private. */
  url: string
}

export type GroupPhotos = Record<string, GroupPhoto>

/** The current photo of every group the person belongs to (row level security keeps out the rest), with signed links. */
export async function listGroupPhotos(): Promise<GroupPhotos> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('groups')
    .select('id, photo_path')
    .not('photo_path', 'is', null)
  if (error) throw error
  const rows = (data ?? []).filter((r): r is { id: string; photo_path: string } =>
    Boolean(r.photo_path),
  )
  if (rows.length === 0) return {}
  const signed = await supabase.storage.from(GROUP_PHOTOS_BUCKET).createSignedUrls(
    rows.map((r) => r.photo_path),
    PHOTO_URL_SECONDS,
  )
  if (signed.error) throw signed.error
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]))
  const photos: GroupPhotos = {}
  for (const row of rows) {
    const url = urlByPath.get(row.photo_path)
    if (url) photos[row.id] = { path: row.photo_path, url }
  }
  return photos
}

/**
 * Uploads the (already optimised) image to a new object, points the group at it and only then deletes the previous
 * one. If pointing the group fails, the new object is removed so nothing is left behind.
 */
export async function uploadGroupPhoto(groupId: string, image: Blob): Promise<void> {
  const supabase = getSupabase()
  const path = `${groupId}/${crypto.randomUUID()}.jpg`
  const storage = supabase.storage.from(GROUP_PHOTOS_BUCKET)
  const uploaded = await storage.upload(path, image, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  })
  if (uploaded.error) throw uploaded.error
  const { data: oldPath, error } = await supabase.rpc('set_group_photo', {
    p_group: groupId,
    p_path: path,
  })
  if (error) {
    await storage.remove([path])
    throw error
  }
  if (oldPath) await storage.remove([oldPath]) // best effort: a leftover file is harmless, never visible
}

export async function removeGroupPhoto(groupId: string): Promise<void> {
  const supabase = getSupabase()
  const { data: oldPath, error } = await supabase.rpc('set_group_photo', {
    p_group: groupId,
    p_path: null,
  })
  if (error) throw error
  if (oldPath) await supabase.storage.from(GROUP_PHOTOS_BUCKET).remove([oldPath])
}
