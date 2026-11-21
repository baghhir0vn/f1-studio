-- A disposable PostgreSQL regression for column-level privilege reduction.
begin;
create table public.orders(
 id bigint primary key,
 status text not null,
 customer_phone text not null
);
insert into public.orders values(1,'pending_confirmation','synthetic');
alter table public.orders enable row level security;
grant select,update on public.orders to authenticated;
create policy fixture_order_admin_update on public.orders for update to authenticated
 using (true) with check (true);
\i security-orders-status-only-preview.sql
-- The staged migration committed its DDL; start a new rollback-only test.
begin;
do $verify$
begin
 if has_table_privilege('authenticated','public.orders','UPDATE')
 then raise exception 'Table-wide UPDATE remains granted'; end if;
 if not has_column_privilege('authenticated','public.orders','status','UPDATE')
 then raise exception 'Admin cannot update order status'; end if;
 if has_column_privilege('authenticated','public.orders','customer_phone','UPDATE')
 then raise exception 'Admin browser can change customer phone'; end if;
 if has_column_privilege('anon','public.orders','status','UPDATE')
 then raise exception 'Anon can update orders'; end if;
end $verify$;
set local role authenticated;
update public.orders set status='confirmed' where id=1;
do $verify$
declare blocked boolean:=false;
begin
  begin
    update public.orders set customer_phone='changed' where id=1;
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'Column-level grant bypassed'; end if;
end $verify$;
reset role;
rollback;
select 'PASS: only admin-authorized status column is writable' as result;
