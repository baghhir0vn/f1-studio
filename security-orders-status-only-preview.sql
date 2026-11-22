-- Stage only. Production must have a verified restorable backup first.
-- Keep admin's direct status update working, but prevent arbitrary order row edits.
-- All other order fields remain readable only through the existing RLS policies.
begin;
do $check$
begin
  if to_regclass('public.orders') is null then
    raise exception 'F1 orders table missing';
  end if;
  if not exists(select 1 from information_schema.columns
     where table_schema='public' and table_name='orders' and column_name='status')
  then raise exception 'F1 status column missing'; end if;
end $check$;

revoke update on table public.orders from authenticated;
grant update (status) on table public.orders to authenticated;
commit;
