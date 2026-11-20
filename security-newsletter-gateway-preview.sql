-- F1 Studio newsletter hardening; stage in isolated Preview/test environment.
-- DO NOT apply to production until /api/newsletter is ready and checked.
-- The old public RPC must be revoked in the SAME cutover as the server API.

begin;
create table if not exists public.newsletter_rate_limits (
  ip inet primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check(attempts >= 0)
);
create index if not exists newsletter_rate_limits_window_idx
  on public.newsletter_rate_limits(window_started_at);
alter table public.newsletter_rate_limits enable row level security;
revoke all on public.newsletter_rate_limits from public, anon, authenticated;
-- Only service-role calls the SECURITY DEFINER gateway; no public RLS policies.

revoke execute on function public.subscribe_newsletter(text)
  from public, anon, authenticated;
grant execute on function public.subscribe_newsletter(text) to service_role;

create or replace function public.subscribe_newsletter_gateway(
  p_email text, p_verified_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_ip inet;
  attempt_total integer;
begin
  if p_verified_ip is null or length(p_verified_ip)>45 or
     p_verified_ip !~ '^[0-9A-Fa-f:.]+$' then
    raise exception 'INVALID_NEWSLETTER_GATEWAY_IP';
  end if;
  begin
    normalized_ip := p_verified_ip::inet;
  exception when invalid_text_representation then
    raise exception 'INVALID_NEWSLETTER_GATEWAY_IP';
  end;
  -- Single atomic INSERT/UPSERT prevents concurrent request races.
  insert into public.newsletter_rate_limits as rate(ip,window_started_at,attempts)
    values(normalized_ip,clock_timestamp(),1)
  on conflict(ip) do update
    set attempts = case
      when rate.window_started_at < clock_timestamp() - interval '15 minutes'
        then 1
      else least(rate.attempts + 1,1000000)
    end,
    window_started_at = case
      when rate.window_started_at < clock_timestamp() - interval '15 minutes'
        then clock_timestamp()
      else rate.window_started_at
    end
  returning attempts into attempt_total;
  if attempt_total > 8 then
    raise exception 'NEWSLETTER_RATE_LIMITED';
  end if;
  -- Preserve current email validation and idempotent registration.
  return public.subscribe_newsletter(p_email);
end;
$function$;

revoke all on function public.subscribe_newsletter_gateway(text,text)
  from public, anon, authenticated;
grant execute on function public.subscribe_newsletter_gateway(text,text)
  to service_role;
commit;
