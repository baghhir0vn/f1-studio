-- F1 Studio - isolated/staged fix for site-content upload path checks.
-- NOT APPLIED TO PRODUCTION. Apply after reviewing actual production Storage bucket
-- ownership and validating admin uploads in Preview.
-- Existing policy erroneously uses a doubly-escaped literal backslash before the
-- extension, so a valid "categories/<uuid>.jpg" does not match.
begin;
drop policy if exists "f1_site_content_admin_insert" on storage.objects;
create policy "f1_site_content_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'site-content'
  and name ~ '^(categories|heroes)/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|gif|avif)$'
  and (select private.is_admin_user())
);
commit;
