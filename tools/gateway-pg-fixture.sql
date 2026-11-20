-- Synthetic PostgreSQL fixture for the production gateway SQL.
-- No connection to F1 Studio or Supabase; uses PostgreSQL service in CI.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

-- This stub has the EXACT argument and return signature of the existing
-- create_order RPC. It returns context rather than storing real orders.
-- This test verifies function grants, role and verified-identity propagation.
create function public.create_order(
 p_items jsonb,
 p_customer_name text,
 p_customer_phone text,
 p_customer_email text default '',
 p_delivery text default 'pickup',
 p_address text default '',
 p_address_unknown boolean default false,
 p_gift_wrap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
begin
  return jsonb_build_object(
    'order',jsonb_build_object(
      'order_code','F1-SYNTHETIC',
      'status','pending_confirmation',
      'total',10,
      'user_id',auth.uid(),
      'client_ip',current_setting('request.headers',true)::jsonb->>'x-forwarded-for'
    )
  );
end
$fn$;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function public.create_order(jsonb,text,text,text,text,text,boolean,boolean)
 to anon, authenticated, service_role;
