-- Disposable PostgreSQL verification for the staged review RLS migration.
-- The test DB is provided by GitHub Actions, not a live Supabase project.
begin;
create table public.profiles (
 id uuid primary key,
 role text not null default 'customer',
 blocked boolean not null default false
);
create table public.reviews (
 id bigint primary key,
 author text not null,
 stars integer not null,
 text text not null,
 status text not null default 'pending',
 user_id uuid not null
);
insert into public.profiles(id,role,blocked) values
 ('00000000-0000-4000-8000-000000000003','customer',false),
 ('00000000-0000-4000-8000-000000000004','customer',true);
alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
grant usage on schema auth to authenticated;
grant select on public.profiles to authenticated;
grant insert on public.reviews to authenticated;
create policy profiles_own_read on public.profiles for select to authenticated
  using (id=(select auth.uid()));
-- The original production review insert policy is the baseline fixture.
create policy "reviews public insert" on public.reviews for insert to authenticated
with check (
 status='pending'
 and user_id=(select auth.uid())
 and length(trim(author)) between 2 and 80
 and length(trim(text)) between 5 and 1000
);
-- Apply proposed production remediation to the isolated synthetic schema.
\i security-reviews-blocked-users-preview.sql

set local role authenticated;
do $assert$
declare
 denied boolean;
begin
 -- Allowed customer remains able to submit a pending review.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
 insert into public.reviews(id,author,stars,text,status,user_id) values (
  1,'Test customer',5,'Valid synthetic review','pending',
  '00000000-0000-4000-8000-000000000003'
 );

 -- RLS must deny attempts to insert a review for another user.
 denied:=false;
 begin
   insert into public.reviews(id,author,stars,text,status,user_id) values (
    2,'Test customer',5,'Forged synthetic review','pending',
    '00000000-0000-4000-8000-000000000004');
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'REGRESSION: impersonated review accepted'; end if;

 -- A user cannot insert an approved review and bypass moderation.
 denied:=false;
 begin
   insert into public.reviews(id,author,stars,text,status,user_id) values (
    3,'Test customer',5,'Unmoderated synthetic review','approved',
    '00000000-0000-4000-8000-000000000003');
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'REGRESSION: approved review bypassed moderation'; end if;

 -- This is the new key assertion: a blocked account cannot bypass the UI.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
 denied:=false;
 begin
   insert into public.reviews(id,author,stars,text,status,user_id) values (
    4,'Blocked customer',5,'Blocked synthetic review','pending',
    '00000000-0000-4000-8000-000000000004');
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'REGRESSION: blocked user inserted review'; end if;
end
$assert$;
reset role;
do $assert$
declare hits integer;
begin
 select count(*) into hits from public.reviews;
 if hits <> 1 then raise exception 'REGRESSION: only 1 valid review expected, got %',hits; end if;
 if has_table_privilege('anon','public.reviews','INSERT') then
   raise exception 'REGRESSION: guests can insert reviews';
 end if;
end $assert$;
rollback;
select 'PASS: normal review allowed; blocked, impersonated, approved review denied' as result;
