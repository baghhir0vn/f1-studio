-- F1 Studio — authenticated server-only checkout gateway.
-- STAGE ON AN ISOLATED SUPABASE TEST BRANCH FIRST.
-- IMPORTANT: deploy the Vercel Function + configure its secrets before applying
-- this migration to production, otherwise all browser checkouts will fail.
-- This intentionally does NOT include the previously proposed stock changes.
begin;

-- The original create_order() RPC must no longer be callable with public keys.
revoke execute on function public.create_order(
 jsonb,text,text,text,text,text,boolean,boolean
) from public, anon, authenticated;
grant execute on function public.create_order(
 jsonb,text,text,text,text,text,boolean,boolean
) to service_role;

-- The server verifies Cloudflare Siteverify + the optional user JWT before
-- sending arguments. This function is only callable using the server-side
-- service-role credential, never through a client publishable key.
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
commit;
