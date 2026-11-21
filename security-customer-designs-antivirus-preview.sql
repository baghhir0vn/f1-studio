-- F1 Studio Security Test only. Existing production designs need a migration of their own.
begin;

do $guard$
begin
  if exists (select 1 from storage.objects where bucket_id = 'customer-designs')
  or exists (select 1 from storage.buckets where id = 'customer-designs' and public) then
    raise exception 'Apply only to an empty, private Preview design bucket';
  end if;
end
$guard$;

create table private.design_scan_jobs (
  object_id uuid not null,
  object_version text not null,
  lease uuid not null,
  available_at timestamptz not null,
  attempts integer not null default 1 check (attempts between 1 and 3),
  state text not null default 'scanning' check (state in ('scanning', 'clean', 'rejected', 'failed')),
  sha256 text,
  primary key (object_id, object_version),
  check (state <> 'clean' or (sha256 is not null and sha256 ~ '^[a-f0-9]{64}$'))
);
alter table private.design_scan_jobs enable row level security;
revoke all on private.design_scan_jobs from public, anon, authenticated;
grant usage on schema private, storage to service_role;
grant select, insert, update on private.design_scan_jobs to service_role;

create function private.approved_design_is_readable(p_object_id uuid, p_version text, p_owner text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (p_owner = (select auth.uid())::text or (select public.is_admin()))
    and exists (
    select 1 from private.design_scan_jobs
    where object_id = p_object_id and object_version = p_version and state = 'clean'
  );
$$;
revoke all on function private.approved_design_is_readable(uuid,text,text) from public;
grant execute on function private.approved_design_is_readable(uuid,text,text) to anon, authenticated;

-- The exact stored version remains in quarantine until approved.
-- This restrictive policy also applies when another permissive SELECT policy exists.
create policy "customer design must pass malware scan" on storage.objects
as restrictive for select to public using (
  bucket_id <> 'customer-designs'
  or private.approved_design_is_readable(id, version, owner_id)
);
create policy "scanned designs readable by owner or admin" on storage.objects
for select to authenticated using (
  bucket_id = 'customer-designs'
  and (owner_id = (select auth.uid())::text or (select public.is_admin()))
);
create policy "scanned designs removable by owner or admin" on storage.objects
for delete to authenticated using (
  bucket_id = 'customer-designs'
  and (owner_id = (select auth.uid())::text or (select public.is_admin()))
);

-- Deny replacement, even if another permissive policy is added later.
create policy "customer design versions are immutable" on storage.objects
as restrictive for update to anon, authenticated
using (bucket_id <> 'customer-designs')
with check (bucket_id <> 'customer-designs');

create function public.f1_claim_design_scan()
returns table (object_id uuid, object_version text, object_path text, lease uuid)
language sql set search_path = ''
as $$
  with candidate as (
    select o.id, o.version, o.name
    from storage.objects o
    left join private.design_scan_jobs j on (j.object_id, j.object_version) = (o.id, o.version)
    where o.bucket_id = 'customer-designs'
      and o.version is not null and o.archived_at is null and not coalesce(o.is_delete_marker, false)
      and o.name ~ '^orders/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|pdf)$'
      and (j.object_id is null or
           (j.state = 'scanning' and j.attempts < 3 and j.available_at <= clock_timestamp()))
    order by o.created_at, o.id
    limit 1
  ), claimed as (
    insert into private.design_scan_jobs as j (object_id, object_version, lease, available_at)
    select c.id, c.version, gen_random_uuid(), clock_timestamp() + interval '90 seconds'
    from candidate c
    on conflict on constraint design_scan_jobs_pkey do update
      set lease = excluded.lease, available_at = excluded.available_at, attempts = j.attempts + 1
      where j.state = 'scanning' and j.attempts < 3 and j.available_at <= clock_timestamp()
    returning j.object_id, j.object_version, j.lease
  )
  select claimed.object_id, claimed.object_version, candidate.name, claimed.lease
  from claimed join candidate on candidate.id = claimed.object_id and candidate.version = claimed.object_version;
$$;
revoke all on function public.f1_claim_design_scan() from public, anon, authenticated;
grant execute on function public.f1_claim_design_scan() to service_role;

create function public.f1_finish_design_scan(
  p_id uuid, p_version text, p_lease uuid, p_verdict text, p_sha256 text
)
returns boolean language sql set search_path = ''
as $$
  with saved as (
    update private.design_scan_jobs j
    set state = case when p_verdict = 'retry' and j.attempts < 3 then 'scanning'
                     when p_verdict = 'retry' then 'failed' else p_verdict end,
        available_at = clock_timestamp() + interval '30 seconds',
        sha256 = case when p_verdict = 'clean' then p_sha256 end
    where j.object_id = p_id and j.object_version = p_version and j.lease = p_lease
      and j.state = 'scanning' and j.available_at > clock_timestamp()
      and p_verdict in ('clean', 'rejected', 'retry')
      and (p_verdict <> 'clean' or p_sha256 ~ '^[a-f0-9]{64}$')
      and exists (
        select 1 from storage.objects o
        where o.id = p_id and o.version = p_version and o.bucket_id = 'customer-designs'
          and o.archived_at is null and not coalesce(o.is_delete_marker, false)
      )
    returning 1
  )
  select exists (select 1 from saved);
$$;
revoke all on function public.f1_finish_design_scan(uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.f1_finish_design_scan(uuid,text,uuid,text,text) to service_role;

-- Every attachment, including additional layers, must belong to the order owner.
create function private.require_scanned_order_designs()
returns trigger language plpgsql set search_path = ''
as $$
declare
  attachment_path text;
  order_user uuid;
  uploads jsonb;
  scan_state text;
begin
  if coalesce(jsonb_typeof(new.customization), 'null') <> 'object' then return new; end if;
  uploads := coalesce(nullif(new.customization->'uploads', 'null'::jsonb), '[]'::jsonb);
  if jsonb_typeof(uploads) <> 'array' then raise exception 'INVALID_DESIGN_PATH'; end if;
  if jsonb_array_length(uploads) > 9 then raise exception 'INVALID_DESIGN_PATH'; end if;

  select o.user_id into order_user from public.orders o where o.id = new.order_id;
  for attachment_path in
    select nullif(new.customization->>'imagePath', '')
    union all
    select coalesce(item->>'path', '') from jsonb_array_elements(uploads) item
  loop
    if attachment_path is null then continue; end if;
    if order_user is null or attachment_path !~ (
      '^orders/' || order_user::text || '/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|pdf)$'
    ) then
      raise exception 'INVALID_DESIGN_PATH';
    end if;
    select case when j.state = 'scanning' and j.attempts = 3
                          and j.available_at <= clock_timestamp() then 'failed' else j.state end
    into scan_state
    from storage.objects o
    left join private.design_scan_jobs j on (j.object_id, j.object_version) = (o.id, o.version)
    where o.bucket_id = 'customer-designs' and o.name = attachment_path
      and o.owner_id = order_user::text and o.archived_at is null
      and not coalesce(o.is_delete_marker, false);
    if scan_state = 'rejected' then raise exception 'DESIGN_SCAN_REJECTED'; end if;
    if scan_state = 'failed' then raise exception 'DESIGN_SCAN_UNAVAILABLE'; end if;
    if scan_state is distinct from 'clean' then raise exception 'DESIGN_SCAN_REQUIRED'; end if;
  end loop;
  return new;
end
$$;
revoke all on function private.require_scanned_order_designs() from public, anon, authenticated;

create trigger require_scanned_order_designs before insert or update of order_id, customization
on public.order_items for each row execute function private.require_scanned_order_designs();

-- A private bucket created empty in the same transaction as the access rules.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-designs', 'customer-designs', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

commit;
