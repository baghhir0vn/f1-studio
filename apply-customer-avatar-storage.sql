-- F1 Studio customer avatar storage
-- Run once in the Supabase SQL editor for the production project before enabling image uploads.
-- Files are private; each authenticated user can read/write only their own avatar directory.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-avatars', 'customer-avatars', false, 524288, array['image/webp'])
on conflict (id) do nothing;

drop policy if exists "F1 users read own customer avatars" on storage.objects;
create policy "F1 users read own customer avatars"
on storage.objects for select to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and name ~* '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
);

drop policy if exists "F1 users upload own customer avatars" on storage.objects;
create policy "F1 users upload own customer avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and name ~* '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
);

drop policy if exists "F1 users delete own customer avatars" on storage.objects;
create policy "F1 users delete own customer avatars"
on storage.objects for delete to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and name ~* '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
);

commit;
