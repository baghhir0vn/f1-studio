-- Security Preview: synthetic role and RLS regression tests.
-- Runs ONLY in GitHub Actions disposable PostgreSQL; no Supabase credentials.
-- Models audited production is_admin(), profiles and orders policies.
-- DOES NOT replace authenticated end-to-end testing of the actual production schema.
begin;
create table public.profiles (
  id uuid primary key,
  role text not null default 'customer',
  blocked boolean not null default false
);
create table public.orders (
  id bigint primary key,
  user_id uuid,
  status text not null default 'pending_confirmation'
);

insert into public.profiles(id, role, blocked) values
 ('00000000-0000-4000-8000-000000000001','admin',false),
 ('00000000-0000-4000-8000-000000000002','admin',true),
 ('00000000-0000-4000-8000-000000000003','customer',false),
 ('00000000-0000-4000-8000-000000000004','customer',true),
 ('00000000-0000-4000-8000-000000000005','customer',false);

insert into public.orders(id,user_id) values
 (1,'00000000-0000-4000-8000-000000000003'),
 (2,'00000000-0000-4000-8000-000000000004'),
 (3,'00000000-0000-4000-8000-000000000005');

-- Mirrors audited production function, including blocked admin check.
create function public.is_admin()
returns boolean
language sql stable security definer set search_path to ''
as $fn$
  select exists (
    select 1 from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and coalesce(p.blocked,false) = false
  );
$fn$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Functional fixture for the actual production admin_list_orders() authorization guard.
-- Returns only synthetic order COUNT; never real personal details.
create function public.admin_list_orders(p_limit integer default 5000)
returns jsonb language plpgsql stable security definer set search_path to ''
as $fn$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return jsonb_build_object('count',(select count(*) from public.orders));
end
$fn$;
revoke execute on function public.admin_list_orders(integer) from public, anon;
grant execute on function public.admin_list_orders(integer) to authenticated;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
grant usage on schema auth to anon, authenticated;
grant select on public.profiles, public.orders to authenticated;
grant update (blocked) on public.profiles to authenticated;
grant update (status) on public.orders to authenticated;

-- Mirrors production RLS predicates relevant to this test.
create policy profiles_own_read on public.profiles for select to authenticated
 using (id = (select auth.uid()));
create policy profiles_admin_read on public.profiles for select to authenticated
 using (public.is_admin());
create policy profiles_admin_blocked_update on public.profiles for update to authenticated
 using (public.is_admin() and role='customer')
 with check (public.is_admin() and role='customer');
create policy orders_own_read on public.orders for select to authenticated
 using (user_id = (select auth.uid()) or public.is_admin());
create policy orders_admin_update on public.orders for update to authenticated
 using (public.is_admin()) with check (public.is_admin());

-- Fixture is owned by postgres; execute assertions with the real authenticated role.
set local role authenticated;

do $assert$
declare
 hits bigint;
 changed integer;
 denied boolean;
 payload jsonb;
begin
 -- Ordinary customer: only own order, no admin data or admin writes.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
 if public.is_admin() then raise exception 'REGRESSION: customer became admin'; end if;
 select count(*) into hits from public.orders;
 if hits <> 1 then raise exception 'REGRESSION: customer can view % orders',hits; end if;
 denied:=false;
 begin
   perform public.admin_list_orders(10);
 exception when raise_exception then
   if sqlerrm = 'ADMIN_REQUIRED' then denied:=true; else raise; end if;
 end;
 if not denied then raise exception 'REGRESSION: customer accessed admin RPC'; end if;
 update public.orders set status='confirmed' where id=2;
 get diagnostics changed=row_count;
 if changed <> 0 then raise exception 'REGRESSION: customer changed another order'; end if;
 denied:=false;
 begin
   update public.profiles set role='admin' where id='00000000-0000-4000-8000-000000000003';
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'REGRESSION: customer can change their own role'; end if;

 -- Blocked customer cannot grant self admin privileges or see other orders.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
 if public.is_admin() then raise exception 'REGRESSION: blocked customer became admin'; end if;
 select count(*) into hits from public.orders;
 if hits <> 1 then raise exception 'REGRESSION: blocked customer order visibility %',hits; end if;
 update public.profiles set blocked=false where id='00000000-0000-4000-8000-000000000004';
 get diagnostics changed=row_count;
 if changed <> 0 then raise exception 'REGRESSION: blocked customer unblocked themself'; end if;

 -- Blocked admin's profile role must not override their blocked status.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
 if public.is_admin() then raise exception 'REGRESSION: blocked admin passed authorization'; end if;
 select count(*) into hits from public.orders;
 if hits <> 0 then raise exception 'REGRESSION: blocked admin read orders'; end if;
 denied:=false;
 begin
   perform public.admin_list_orders(10);
 exception when raise_exception then
   if sqlerrm = 'ADMIN_REQUIRED' then denied:=true; else raise; end if;
 end;
 if not denied then raise exception 'REGRESSION: blocked admin accessed admin RPC'; end if;

 -- Active admin can read and manage synthetic orders, not self-promote customers.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 if not public.is_admin() then raise exception 'REGRESSION: active admin denied'; end if;
 select count(*) into hits from public.orders;
 if hits <> 3 then raise exception 'REGRESSION: active admin visible orders %',hits; end if;
 payload:=public.admin_list_orders(10);
 if payload->>'count' <> '3' then raise exception 'REGRESSION: active admin RPC incorrect'; end if;
 update public.orders set status='confirmed' where id=2;
 get diagnostics changed=row_count;
 if changed <> 1 then raise exception 'REGRESSION: admin update denied'; end if;
 update public.profiles set blocked=false where id='00000000-0000-4000-8000-000000000004';
 get diagnostics changed=row_count;
 if changed <> 1 then raise exception 'REGRESSION: admin cannot unblock customer'; end if;
end
$assert$;

reset role;
-- Confirm public guest never has direct access to admin function.
do $assert$
begin
 if has_function_privilege('anon','public.admin_list_orders(integer)','EXECUTE') then
  raise exception 'REGRESSION: guest can call admin RPC';
 end if;
 if has_table_privilege('anon','public.orders','SELECT') then
  raise exception 'REGRESSION: guest can read private orders';
 end if;
end $assert$;
rollback;
-- All fixture writes and role contexts are discarded.
select 'PASS: customer / blocked customer / blocked admin / active admin synthetic authorization matrix' as result;
