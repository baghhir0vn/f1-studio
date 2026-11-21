-- Tests isolated from production credentials and tables.
-- SQL test runs after security-order-gateway-preview.sql.
do $assertions$
declare
  src regprocedure :=
    'public.create_order(jsonb,text,text,text,text,text,boolean,boolean)'::regprocedure;
  gateway regprocedure :=
    'public.create_order_gateway(jsonb,text,text,text,text,text,boolean,boolean,uuid,text)'::regprocedure;
begin
  if has_function_privilege('anon',src,'EXECUTE')
    or has_function_privilege('authenticated',src,'EXECUTE') then
    raise exception 'Direct anonymous/registered RPC still executable';
  end if;
  if has_function_privilege('anon',gateway,'EXECUTE')
    or has_function_privilege('authenticated',gateway,'EXECUTE') then
    raise exception 'Gateway exposed to browser role';
  end if;
  if not has_function_privilege('service_role',src,'EXECUTE')
    or not has_function_privilege('service_role',gateway,'EXECUTE') then
    raise exception 'Gateway unavailable to service role';
  end if;
end
$assertions$;

set role service_role;
do $assertions$
declare
  r jsonb;
  id uuid := '7d4e67ca-4443-4ce2-9c1c-32281ff0927a';
begin
  r := public.create_order_gateway(
    '[]'::jsonb,'Test Buyer','0501234567',
    p_verified_user_id=>id,
    p_verified_ip=>'203.0.113.19'
  );
  if r #>> '{order,user_id}' <> id::text then
    raise exception 'Verified user identity not propagated: %',r;
  end if;
  if r #>> '{order,client_ip}' <> '203.0.113.19' then
    raise exception 'Trusted client IP not propagated: %',r;
  end if;
  -- An anonymous guest must not inherit the previous customer identity.
  r := public.create_order_gateway(
    '[]'::jsonb,'Guest Buyer','0501234567',
    p_verified_user_id=>null,
    p_verified_ip=>'2001:db8::1'
  );
  if (r #> '{order,user_id}') is distinct from 'null'::jsonb then
    raise exception 'Guest inherited customer identity: %',r;
  end if;
  if r #>> '{order,client_ip}' <> '2001:db8::1' then
    raise exception 'IPv6 client IP not propagated: %',r;
  end if;

  begin
    perform public.create_order_gateway(
      '[]'::jsonb,'Invalid Buyer','0501234567',
      p_verified_ip=>'spoofed-hostname'
    );
    raise exception 'DID_NOT_REJECT_IP';
  exception when raise_exception then
    if SQLERRM = 'DID_NOT_REJECT_IP' then raise; end if;
    if SQLERRM <> 'INVALID_GATEWAY_CONTEXT' then
      raise exception 'Wrong error for invalid IP: %',SQLERRM;
    end if;
  end;
end
$assertions$;
reset role;
