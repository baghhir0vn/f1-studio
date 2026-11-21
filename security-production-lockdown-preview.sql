-- Phase B: only after Phase A, deployment and real Preview-like
-- browser checkout/newsletter tests all succeeded on the target environment.
-- NEVER execute before a verified production backup and separate restore.
-- Deliberately revokes the old direct browser paths; gateway functions stay live.
begin;
revoke execute on function public.create_order(
  jsonb,text,text,text,text,text,boolean,boolean
) from public,anon,authenticated;
grant execute on function public.create_order(
  jsonb,text,text,text,text,text,boolean,boolean
) to service_role;
revoke execute on function public.subscribe_newsletter(text)
from public,anon,authenticated;
grant execute on function public.subscribe_newsletter(text) to service_role;
commit;
