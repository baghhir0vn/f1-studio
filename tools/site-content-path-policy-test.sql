-- Pure PostgreSQL regex regression. No storage files or database objects are created.
do $test$
declare
  pattern text := '^(categories|heroes)/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|gif|avif)$';
begin
  if not ('categories/123e4567-e89b-42d3-a456-426614174000.jpg' ~ pattern) then
    raise exception 'Valid category asset was rejected';
  end if;
  if not ('heroes/123e4567-e89b-42d3-a456-426614174000.webp' ~ pattern) then
    raise exception 'Valid hero asset was rejected';
  end if;
  if ('../categories/123e4567-e89b-42d3-a456-426614174000.jpg' ~ pattern)
    or ('heroes/123e4567-e89b-42d3-a456-426614174000.svg' ~ pattern)
    or ('heroes/123e4567-e89b-42d3-a456-426614174000.jpg/extra' ~ pattern)
    or ('customer-designs/123e4567-e89b-42d3-a456-426614174000.jpg' ~ pattern) then
    raise exception 'Invalid path was accepted';
  end if;
end $test$;
select 'PASS: site-content path extensions and traversal checks' as result;
