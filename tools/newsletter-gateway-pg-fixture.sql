-- Synthetic newsletter fixture: GitHub Actions disposable PostgreSQL only.
-- Production function semantics reproduced for privilege and rate-limit tests.
create table public.newsletter_subscribers(
  id bigint generated always as identity primary key,
  email text not null unique,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.newsletter_subscribers enable row level security;
create function public.subscribe_newsletter(p_email text)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  clean_email text := lower(trim(coalesce(p_email,'')));
  count_inserted integer := 0;
begin
  if length(clean_email)<5 or length(clean_email)>254
    or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+
  then raise exception 'INVALID_NEWSLETTER_EMAIL'; end if;
  insert into public.newsletter_subscribers(email) values(clean_email)
  on conflict(email) do nothing;
  get diagnostics count_inserted = row_count;
  return jsonb_build_object('ok',true,'subscribed',true,
    'already_subscribed',count_inserted=0);
end $function$;
grant execute on function public.subscribe_newsletter(text) to anon,authenticated,service_role;

  then raise exception 'INVALID_NEWSLETTER_EMAIL'; end if;
  insert into public.newsletter_subscribers(email) values(clean_email)
  on conflict(email) do nothing;
  get diagnostics count_inserted = row_count;
  return jsonb_build_object('ok',true,'subscribed',true,
    'already_subscribed',count_inserted=0);
end $function$;
grant execute on function public.subscribe_newsletter(text) to anon,authenticated,service_role;
