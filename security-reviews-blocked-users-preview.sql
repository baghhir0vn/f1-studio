-- F1 Studio security remediation staged on the isolated Preview branch.
-- DO NOT execute against production before backup/review and explicit approval.
-- Keep approved public review read policy unchanged.
-- The prior INSERT policy checked ownership/content/status, but not blocked users.
-- This migration adds an independent DATABASE authorization gate; client-side
-- reviewService.submit() already checks blocked status but is bypassable.
--
-- The authenticated role can read its own profile (RLS profiles own read), so
-- a blocked row is visible to this EXISTS predicate. No profile -> unchanged
-- behavior: status, owner and content constraints still apply.
-- DB-enforced short-window guard: stop a signed-in user from flooding moderation.
-- Function must be owned by a privileged DB role and is not exposed through API.
create or replace function private.review_submission_under_quota()
returns boolean language sql stable security definer set search_path to ''
as $f$
  select (select auth.uid()) is not null
    and (select count(*) from public.reviews r
      where r.user_id=(select auth.uid())
        and r.created_at >= now() - interval '24 hours') < 5;
$f$;
revoke all on function private.review_submission_under_quota() from public,anon;
grant execute on function private.review_submission_under_quota() to authenticated;

drop policy if exists "reviews public insert" on public.reviews;
create policy "reviews public insert"
on public.reviews
for insert
to authenticated
with check (
  status = 'pending'
  and user_id = (select auth.uid())
  and length(trim(author)) between 2 and 80
  and length(trim(text)) between 5 and 1000
  and not exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and coalesce(profile.blocked,false) = true
  )
  and (select private.review_submission_under_quota())
);
