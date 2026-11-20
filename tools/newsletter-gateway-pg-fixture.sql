-- Disposable PostgreSQL newsletter fixture, no personal or production data.
create table public.newsletter_subscribers(
  id bigint generated always as identity primary key,
  email text not null unique,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.newsletter_subscribers enable row level security;

create function public.subscribe_newsletter(p_email text)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
  normalized text := lower(trim(coalesce(p_email,'')));
  inserted_count integer := 0;
begin
  if length(normalized)<5 or length(normalized)>254
    or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'INVALID_NEWSLETTER_EMAIL';
  end if;
  insert into public.newsletter_subscribers(email)
    values(normalized) on conflict(email) do nothing;
  get diagnostics inserted_count = row_count;
  return jsonb_build_object('ok',true,'subscribed',true,
    'already_subscribed',inserted_count=0);
end;
$fn$;

grant execute on function public.subscribe_newsletter(text) to anon,authenticated,service_role;
