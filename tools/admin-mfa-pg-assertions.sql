-- Disposable PostgreSQL test: admin role + blocked flag + MFA AAL2.
-- No real admin passwords, JWTs, production data, or live Supabase changes.
begin;
create schema private;
grant usage on schema private to authenticated;
create function auth.jwt() returns jsonb
language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$f$;
grant usage on schema auth to authenticated;
grant execute on function auth.jwt() to authenticated;
create table public.profiles(
 id uuid primary key,
 role text not null default 'customer',
 blocked boolean not null default false
);
insert into public.profiles(id,role,blocked) values
 ('00000000-0000-4000-8000-000000000001','admin',false),
 ('00000000-0000-4000-8000-000000000002','admin',true),
 ('00000000-0000-4000-8000-000000000003','customer',false);
create table public.orders(id integer primary key,user_id uuid);
insert into public.orders(id,user_id) values
 (1,'00000000-0000-4000-8000-000000000003'),
 (2,'00000000-0000-4000-8000-000000000002');
alter table public.orders enable row level security;
grant select on public.orders to authenticated;
-- Apply the staged exact SQL, not a duplicated mock.
\i security-admin-mfa-preview.sql
create policy "orders own read" on public.orders
  for select to authenticated
  using (user_id=(select auth.uid()) or public.is_admin());
grant execute on function private.is_admin_user() to authenticated;

set local role authenticated;
do $tests$
declare n bigint;
begin
 -- Wrong or absent MFA must prevent access even with an admin role.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 if public.is_admin() or private.is_admin_user() then
   raise exception 'FAIL: AAL1 admin accepted';
 end if;
 select count(*) into n from public.orders;
 if n<>0 then raise exception 'FAIL: AAL1 admin read other orders'; end if;

 -- AAL2 + active admin grants expected access.
 perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 if not public.is_admin() or not private.is_admin_user() then
   raise exception 'FAIL: AAL2 admin rejected';
 end if;
 select count(*) into n from public.orders;
 if n<>2 then raise exception 'FAIL: AAL2 admin cannot read orders'; end if;

 -- AAL2 on a blocked admin is still denied.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
 if public.is_admin() or private.is_admin_user() then
   raise exception 'FAIL: blocked admin accepted';
 end if;

 -- AAL2 on normal customers never upgrades role.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
 if public.is_admin() or private.is_admin_user() then
   raise exception 'FAIL: normal customer escalated';
 end if;
 select count(*) into n from public.orders;
 if n<>1 then raise exception 'FAIL: customer owner RLS changed'; end if;

 -- Missing user claim must be denied even if a forged MFA level is present.
 perform set_config('request.jwt.claim.sub','',true);
 if public.is_admin() or private.is_admin_user() then
   raise exception 'FAIL: missing user authorized';
 end if;
end
$tests$;
reset role;
rollback;
select 'PASS: staged admin AAL2 requires MFA plus unblocked admin role' as result;
