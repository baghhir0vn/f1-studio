-- TEST-SUPABASE-ONLY MIGRATION. Not for production, which already has
-- two admin helper functions with existing policies and separate migration gates.
-- Isolated project: dlwjkcqoclvlsyjmrjec; users/profiles were both 0 before this migration.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
-- F1 Studio — staged admin MFA enforcement (NOT ACTIVATED).
-- Never apply until admin TOTP enrollment, recovery, and aal2 login flows work.
-- This must be evaluated from the cryptographically verified Supabase user JWT,
-- NOT from user_metadata, a browser-supplied role, or a request parameter.
-- This replaces existing production admin helper functions only when approved.
-- The old admin helper grants remain unchanged by CREATE OR REPLACE.

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path to ''
as $function$
  select
    coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and coalesce(p.blocked,false) = false
    );
$function$;

create or replace function private.is_admin_user()
returns boolean
language sql stable security definer
set search_path to ''
as $function$
  select
    coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and coalesce(p.blocked,false) = false
    );
$function$;
-- Test-only hardening: newly created security-definer helpers must not
-- inherit PUBLIC execute grants. Keep private schema outside Data API exposure.
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE ALL ON FUNCTION private.is_admin_user() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_user() TO authenticated;
COMMIT;
