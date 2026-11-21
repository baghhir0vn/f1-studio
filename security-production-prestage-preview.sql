-- Stage only. Phase A for a later coordinated production rollout.
-- IMPORTANT: NO legacy anonymous RPC revocation in this phase.
-- Old storefront continues working while gateway functions are installed.
-- This file is only safe after a verified real backup and isolated restore.
-- Do not apply production until the owner signs the release gate.
begin;

create or replace function public.create_order_gateway(
 p_items jsonb,
 p_customer_name text,
 p_customer_phone text,
 p_customer_email text default '',
 p_delivery text default 'pickup',
 p_address text default '',
 p_address_unknown boolean default false,
 p_gift_wrap boolean default false,
 p_verified_user_id uuid default null,
 p_verified_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  previous_sub text := current_setting('request.jwt.claim.sub', true);
  previous_headers text := current_setting('request.headers', true);
  response jsonb;
begin
  -- Reject unexpected impersonation/unsanitized IP even if a backend bug occurs.
  if p_verified_ip is null or length(p_verified_ip)>45
     or not (p_verified_ip ~ '^[0-9a-fA-F:.]+$') then
    raise exception 'INVALID_GATEWAY_CONTEXT';
  end if;

  perform set_config('request.jwt.claim.sub',
    coalesce(p_verified_user_id::text, ''), true);
  perform set_config('request.headers',
    jsonb_build_object('x-forwarded-for', p_verified_ip)::text, true);

  response := public.create_order(
    p_items,p_customer_name,p_customer_phone,p_customer_email,p_delivery,
    p_address,p_address_unknown,p_gift_wrap
  );

  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''), true);
  perform set_config('request.headers',coalesce(previous_headers,'{}'),true);
  return response;
end;
$function$;

revoke all on function public.create_order_gateway(
 jsonb,text,text,text,text,text,boolean,boolean,uuid,text
) from public, anon, authenticated;
grant execute on function public.create_order_gateway(
 jsonb,text,text,text,text,text,boolean,boolean,uuid,text
) to service_role;

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
  -- Keep the existing idempotent INSERT/validation logic, but do not
  -- propagate the enrollment oracle ('already_subscribed') through the gateway.
  perform public.subscribe_newsletter(p_email);
  return jsonb_build_object('ok',true,'subscribed',true);
end;
$function$;

revoke all on function public.subscribe_newsletter_gateway(text,text)
  from public, anon, authenticated;
grant execute on function public.subscribe_newsletter_gateway(text,text)
  to service_role;
commit;
