-- F1 Studio production gate (READ-ONLY). Run after the two hardening migrations.

select table_name, grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('order_items','orders','products','profiles','reviews','site_settings')
  and grantee in ('anon','authenticated','service_role')
group by table_name, grantee
order by table_name, grantee;

select r.rolname as grantee,
       has_function_privilege(
         r.rolname,
         'public.create_order(jsonb,text,text,text,text,text,boolean,boolean)'::regprocedure,
         'EXECUTE'
       ) as can_execute
from pg_roles r
where r.rolname in ('anon','authenticated','service_role','public')
order by r.rolname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname='public' and tablename in ('profiles','products','reviews','orders','order_items','site_settings'))
   or (schemaname='storage' and tablename='objects')
order by schemaname, tablename, policyname;

select c.id, c.name, c.public, c.file_size_limit, c.allowed_mime_types
from storage.buckets c
where c.id in ('customer-designs','product-images')
order by c.id;

select n.nspname as schema_name,
       p.proname as function_name,
       p.prosecdef as security_definer,
       p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='create_order';
