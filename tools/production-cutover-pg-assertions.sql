-- Two-phase production cutover rehearsal, using ONLY synthetic local PostgreSQL.
-- Assumes tools/gateway-pg-fixture.sql and tools/newsletter-gateway-pg-fixture.sql.
\i security-production-prestage-preview.sql
do $assert$
begin
 if not has_function_privilege('anon',
   'public.create_order(jsonb,text,text,text,text,text,boolean,boolean)','EXECUTE')
 then raise exception 'Phase A prematurely disabled old storefront checkout'; end if;
 if not has_function_privilege('anon','public.subscribe_newsletter(text)','EXECUTE')
 then raise exception 'Phase A prematurely disabled old newsletter'; end if;
 if has_function_privilege('anon',
   'public.create_order_gateway(jsonb,text,text,text,text,text,boolean,boolean,uuid,text)','EXECUTE')
 then raise exception 'Phase A exposed order gateway to anon'; end if;
 if has_function_privilege('anon',
   'public.subscribe_newsletter_gateway(text,text)','EXECUTE')
 then raise exception 'Phase A exposed newsletter gateway to anon'; end if;
 if not has_function_privilege('service_role',
   'public.create_order_gateway(jsonb,text,text,text,text,text,boolean,boolean,uuid,text)','EXECUTE')
 then raise exception 'Phase A server lacks checkout gateway'; end if;
 if not has_function_privilege('service_role',
   'public.subscribe_newsletter_gateway(text,text)','EXECUTE')
 then raise exception 'Phase A server lacks newsletter gateway'; end if;
end $assert$;
\i security-production-lockdown-preview.sql
do $assert$
begin
 if has_function_privilege('anon',
   'public.create_order(jsonb,text,text,text,text,text,boolean,boolean)','EXECUTE')
 then raise exception 'Phase B still permits anonymous direct checkout'; end if;
 if has_function_privilege('authenticated',
   'public.create_order(jsonb,text,text,text,text,text,boolean,boolean)','EXECUTE')
 then raise exception 'Phase B still permits browser JWT direct checkout'; end if;
 if has_function_privilege('anon','public.subscribe_newsletter(text)','EXECUTE')
   or has_function_privilege('authenticated','public.subscribe_newsletter(text)','EXECUTE')
 then raise exception 'Phase B still permits browser newsletter bypass'; end if;
 if not has_function_privilege('service_role',
   'public.create_order_gateway(jsonb,text,text,text,text,text,boolean,boolean,uuid,text)','EXECUTE')
   or not has_function_privilege('service_role',
   'public.subscribe_newsletter_gateway(text,text)','EXECUTE')
 then raise exception 'Phase B blocked backend gateway'; end if;
end $assert$;
select 'PASS: Phase A backward compatible; Phase B revokes browser RPCs' as result;
