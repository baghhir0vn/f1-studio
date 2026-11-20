-- TEST SUPABASE PROJECT ONLY: create missing baseline newsletter schema in
-- dlwjkcqoclvlsyjmrjec. Never run against production.
-- Leave original RPC PRIVATE throughout; the paired gateway enables service-only.
begin;
create table public.newsletter_subscribers(
  id bigint generated always as identity primary key,
  email text not null unique,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated, public;
create or replace function public.subscribe_newsletter(p_email text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  clean_email text := lower(trim(coalesce(p_email,'')));
  inserted_count integer := 0;
begin
  if length(clean_email)<5 or length(clean_email)>254
    or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  then raise exception 'INVALID_NEWSLETTER_EMAIL'; end if;
  insert into public.newsletter_subscribers(email)
  values (clean_email) on conflict(email) do nothing;
  get diagnostics inserted_count = row_count;
  return jsonb_build_object('ok',true,'subscribed',true,
    'already_subscribed',inserted_count = 0);
end;
$function$;
revoke all on function public.subscribe_newsletter(text) from public, anon, authenticated;
grant execute on function public.subscribe_newsletter(text) to service_role;
commit;
