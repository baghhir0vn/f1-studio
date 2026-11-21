-- Only for the disposable PostgreSQL service in CI.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
create schema storage;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function public.is_admin() returns boolean language sql stable as $$ select false $$;
create table storage.buckets (
  id text primary key, name text, public boolean not null, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key, bucket_id text not null, name text not null, version text not null,
  owner_id text not null, created_at timestamptz not null default now(),
  archived_at timestamptz, is_delete_marker boolean
);
create table public.orders (id bigint primary key, user_id uuid);
create table public.order_items (order_id bigint, customization jsonb);
alter table storage.objects enable row level security;
grant usage on schema auth, storage, private to anon, authenticated, service_role;
grant select, insert, update on storage.objects to anon, authenticated, service_role;
create policy fixture_unrelated_read on storage.objects for select to public using (true);
create policy fixture_update on storage.objects for update to authenticated using (true) with check (true);

\i security-customer-designs-antivirus-preview.sql

begin;
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'customer-designs' and not public
                  and file_size_limit = 10485760 and cardinality(allowed_mime_types) = 4) then
    raise exception 'Private design bucket configuration is incomplete';
  end if;
end $;
insert into storage.objects (id, bucket_id, name, version, owner_id) values
('11111111-1111-4111-8111-111111111111', 'customer-designs',
 'orders/00000000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.png',
 'v1', '00000000-0000-4000-8000-000000000001');
insert into public.orders values (1, '00000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
begin
  if exists (select 1 from storage.objects) then raise exception 'Pending file is visible'; end if;
  if has_function_privilege('public.f1_claim_design_scan()', 'EXECUTE') or
     has_function_privilege('public.f1_finish_design_scan(uuid,text,uuid,text,text)', 'EXECUTE') then
    raise exception 'Customer can use worker RPC';
  end if;
end $$;
reset role;

do $$
declare
  attachment jsonb := '{"uploads":[{"path":"orders/00000000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.png"}]}';
begin
  begin
    insert into public.order_items values (1, attachment);
    raise exception 'Unscanned attachment was accepted';
  exception when raise_exception then
    if sqlerrm <> 'DESIGN_SCAN_REQUIRED' then raise; end if;
  end;
end $$;

set local role service_role;
do $$
declare job record;
begin
  select * into strict job from public.f1_claim_design_scan();
  if exists (select 1 from public.f1_claim_design_scan()) then raise exception 'Double claim'; end if;
  if public.f1_finish_design_scan(job.object_id, job.object_version, gen_random_uuid(), 'clean', repeat('a',64))
    then raise exception 'Wrong lease was accepted'; end if;
  if not public.f1_finish_design_scan(job.object_id, job.object_version, job.lease, 'clean', repeat('a',64))
    then raise exception 'Clean verdict was not saved'; end if;
end $$;
reset role;

set local role authenticated;
do $$
begin
  if not exists (select 1 from storage.objects) then raise exception 'Clean design is not visible'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  if exists (select 1 from storage.objects) then raise exception 'Cross-account read allowed'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  update storage.objects set version = 'v2';
  if found then raise exception 'Customer overwrote an approved version'; end if;
end $$;
reset role;

insert into public.order_items values (1, '{"uploads":[{"path":"orders/00000000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.png"}]}');
update storage.objects set version = 'v2';
set local role authenticated;
do $$
begin
  if exists (select 1 from storage.objects) then raise exception 'Old verdict unlocked a new version'; end if;
end $$;
reset role;
rollback;
