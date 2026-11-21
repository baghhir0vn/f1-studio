-- Security Preview only. Per-account maximum: 50 uploaded design objects.
-- RLS count mitigates casual abuse; simultaneous uploads may race the threshold.
-- Apply to production only after backups and genuine signed-in upload tests.
begin;
create or replace function private.customer_design_upload_allowed()
returns boolean language sql stable security definer set search_path to ''
as $fn$
  select (select count(*) from storage.objects as o
    where o.bucket_id='customer-designs'
      and (storage.foldername(o.name))[2] = (select auth.uid())::text) < 50;
$fn$;
revoke all on function private.customer_design_upload_allowed() from public,anon;
grant execute on function private.customer_design_upload_allowed() to authenticated;
drop policy if exists "customer designs authenticated upload" on storage.objects;
create policy "customer designs authenticated upload"
on storage.objects for insert to authenticated
with check (
  bucket_id='customer-designs'
  and (storage.foldername(name))[1]='orders'
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and name ~ ('^orders/'||(select auth.uid())::text||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|pdf)$')
  and not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and coalesce(p.blocked,false)=true)
  and (select private.customer_design_upload_allowed())
);
commit;
