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
);
