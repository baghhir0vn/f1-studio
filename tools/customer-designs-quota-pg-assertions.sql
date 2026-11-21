-- Synthetic database only. Never connect this test to a real customer database.
begin;
create schema if not exists storage;
create schema if not exists private;
grant usage on schema storage, private, auth to authenticated;
create function storage.foldername(p text) returns text[]
language sql immutable as $f$
select string_to_array(regexp_replace(p,'/[^/]+$',''),'/');
$f$;
create table storage.objects(
  id bigint generated always as identity primary key,
  bucket_id text not null, name text not null, owner_id text);
create table public.profiles(id uuid primary key, blocked boolean not null default false);
insert into public.profiles(id,blocked) values
('00000000-0000-4000-8000-000000000003',false),
('00000000-0000-4000-8000-000000000004',true),
('00000000-0000-4000-8000-000000000005',false);
alter table storage.objects enable row level security;
grant insert on storage.objects to authenticated;
grant usage, select on sequence storage.objects_id_seq to authenticated;
grant select on public.profiles to authenticated;
\i security-customer-designs-quota-preview.sql
-- Staged migration commits its transaction; begin a fresh isolated assertion transaction.
begin;
do $checks$
begin
 if has_function_privilege('anon','private.customer_design_upload_allowed()','EXECUTE')
 then raise exception 'Anonymous quota helper access'; end if;
end $checks$;
set local role authenticated;
do $checks$
declare n int; denied boolean; uid text:='00000000-0000-4000-8000-000000000003';
begin
 perform set_config('request.jwt.claim.sub',uid,true);
 for n in 1..50 loop
   insert into storage.objects(bucket_id,name,owner_id) values
   ('customer-designs','orders/'||uid||'/'||gen_random_uuid()||'.jpg',uid);
 end loop;
 denied:=false;
 begin
   insert into storage.objects(bucket_id,name,owner_id) values
   ('customer-designs','orders/'||uid||'/'||gen_random_uuid()||'.jpg',uid);
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Quota bypass at 51 objects'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
 insert into storage.objects(bucket_id,name,owner_id) values
 ('customer-designs','orders/00000000-0000-4000-8000-000000000005/'||gen_random_uuid()||'.jpg',
  '00000000-0000-4000-8000-000000000005');
 denied:=false;
 begin
 insert into storage.objects(bucket_id,name,owner_id) values
 ('customer-designs','orders/00000000-0000-4000-8000-000000000003/'||gen_random_uuid()||'.jpg',
  '00000000-0000-4000-8000-000000000005');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Cross-account upload bypass'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
 denied:=false;
 begin
 insert into storage.objects(bucket_id,name,owner_id) values
 ('customer-designs','orders/00000000-0000-4000-8000-000000000004/'||gen_random_uuid()||'.pdf',
  '00000000-0000-4000-8000-000000000004');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Blocked-account upload bypass'; end if;
end $checks$;
reset role;
rollback;
select 'PASS: per-customer Storage upload count, ownership and blocked account' as result;
