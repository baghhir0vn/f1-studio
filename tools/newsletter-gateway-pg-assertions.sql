-- Tests real staged migration against synthetic tables/roles, no production.
begin;
do $tests$
begin
  if has_function_privilege('anon','public.subscribe_newsletter(text)'::regprocedure,'EXECUTE')
  or has_function_privilege('authenticated','public.subscribe_newsletter(text)'::regprocedure,'EXECUTE')
  then raise exception 'Direct newsletter RPC is still public'; end if;
  if has_function_privilege('anon','public.subscribe_newsletter_gateway(text,text)'::regprocedure,'EXECUTE')
  or has_function_privilege('authenticated','public.subscribe_newsletter_gateway(text,text)'::regprocedure,'EXECUTE')
  then raise exception 'Gateway exposed to public browser roles'; end if;
  if not has_function_privilege('service_role','public.subscribe_newsletter_gateway(text,text)'::regprocedure,'EXECUTE')
  then raise exception 'Service role cannot call gateway'; end if;
  if has_table_privilege('anon','public.newsletter_rate_limits','SELECT')
  or has_table_privilege('authenticated','public.newsletter_rate_limits','INSERT')
  then raise exception 'Rate limit storage exposed to browser'; end if;
end $tests$;

set local role service_role;
do $tests$
declare
  r jsonb;
  n integer;
  blocked boolean:=false;
begin
  r:=public.subscribe_newsletter_gateway('  Preview@Example.org  ','203.0.113.21');
  if r <> '{"ok":true,"subscribed":true}'::jsonb then
    raise exception 'First signup must only return a generic success';
  end if;
  r:=public.subscribe_newsletter_gateway('preview@example.org','203.0.113.21');
  if r <> '{"ok":true,"subscribed":true}'::jsonb then
    raise exception 'Duplicate signup disclosed subscriber existence';
  end if;
  -- Eight requests in the 15-minute window are permitted.
  for n in 3..8 loop
    perform public.subscribe_newsletter_gateway('preview@example.org','203.0.113.21');
  end loop;
  begin
    perform public.subscribe_newsletter_gateway('preview@example.org','203.0.113.21');
  exception when raise_exception then
    if SQLERRM = 'NEWSLETTER_RATE_LIMITED' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'Ninth request not blocked'; end if;
  -- A different IP may still register. IPs should not share counters.
  r:=public.subscribe_newsletter_gateway('different@example.org','2001:db8::12');
  if r <> '{"ok":true,"subscribed":true}'::jsonb then
    raise exception 'Unrelated IP was blocked';
  end if;
  blocked:=false;
  begin
    perform public.subscribe_newsletter_gateway('bad@example.org','999.999.999.999');
  exception when raise_exception then
    if SQLERRM = 'INVALID_NEWSLETTER_GATEWAY_IP' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'Invalid IP accepted'; end if;
  blocked:=false;
  begin
    perform public.subscribe_newsletter_gateway('not-an-email','203.0.113.22');
  exception when raise_exception then
    if SQLERRM = 'INVALID_NEWSLETTER_EMAIL' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'Invalid email accepted'; end if;
end $tests$;
reset role;
-- Check the deduplicated row as the test database owner. service_role
-- intentionally has no direct SELECT grant on the subscriber table.
do $tests$
begin
  if (select count(*) from public.newsletter_subscribers where email='preview@example.org') <> 1 then
    raise exception 'Duplicate signup inserted multiple rows';
  end if;
end $tests$;
rollback;
select 'PASS: newsletter gateway ACL, dedup, per-IP cap, IPv6 and input checks' as result;
