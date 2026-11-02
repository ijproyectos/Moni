-- Group photos: an optional picture for every group, trip included.
--
-- The image lives in a PRIVATE Storage bucket ("group-photos"); groups.photo_path says which object is the current
-- one. Only active members of a group can read, upload or delete objects under "<group id>/", and they see the
-- image through short-lived signed URLs. There are no administrators: any active member can set, replace or remove
-- the photo. Nothing here touches expenses, members, debts or movements.
--
-- The client optimises the image (JPEG, at most 1080 px a side) before uploading; the bucket enforces the format and
-- a 1 MB cap on its own, so a modified client cannot upload anything else.

-- Column ---------------------------------------------------------------------------------------------

-- "<group uuid>/<photo uuid>.jpg": a new object per upload, so a replaced photo never serves a stale cached file.
alter table public.groups
  add column photo_path text
  check (photo_path is null or photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$');

-- Bucket ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-photos', 'group-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The group an object name belongs to ("<uuid>/..."), or null when the first folder is not a uuid.
create or replace function public.group_photo_group(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

revoke execute on function public.group_photo_group(text) from public, anon;
grant execute on function public.group_photo_group(text) to authenticated;

-- Storage policies: members only (is_group_member is false for a null group and for people who left).
create policy "group_photos_select_member" on storage.objects
for select to authenticated
using (bucket_id = 'group-photos' and public.is_group_member(public.group_photo_group(name)));

create policy "group_photos_insert_member" on storage.objects
for insert to authenticated
with check (bucket_id = 'group-photos' and public.is_group_member(public.group_photo_group(name)));

create policy "group_photos_update_member" on storage.objects
for update to authenticated
using (bucket_id = 'group-photos' and public.is_group_member(public.group_photo_group(name)))
with check (bucket_id = 'group-photos' and public.is_group_member(public.group_photo_group(name)));

create policy "group_photos_delete_member" on storage.objects
for delete to authenticated
using (bucket_id = 'group-photos' and public.is_group_member(public.group_photo_group(name)));

-- RPC ------------------------------------------------------------------------------------------------

-- Points the group at an uploaded object (or, with null, removes the photo). Returns the previous path so the
-- client can delete that file. The object has to exist in the bucket and belong to this group's folder.
create or replace function public.set_group_photo(p_group uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  -- Same rule as every other group write: active member, and the group is not archived.
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '55000';
  end if;
  if p_path is not null then
    if public.group_photo_group(p_path) is distinct from p_group
       or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then
      raise exception 'invalid_photo_path' using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o where o.bucket_id = 'group-photos' and o.name = p_path
    ) then
      raise exception 'photo_not_found' using errcode = 'P0002';
    end if;
  end if;
  select g.photo_path into v_old from public.groups g where g.id = p_group;
  update public.groups set photo_path = p_path where id = p_group;
  return v_old;
end;
$$;

revoke execute on function public.set_group_photo(uuid, text) from public, anon;
grant execute on function public.set_group_photo(uuid, text) to authenticated;
