-- F1 Studio — RESTORE METADATA INVENTORY (READ-ONLY).
-- Run only against a separately restored candidate or the known baseline DB.
-- Returns ONE JSON object. Never reads customers, orders, email or file contents.
-- Comparing schema metadata is NOT proof of actual restored row data / Storage files.
WITH public_tables AS (
  SELECT COALESCE(jsonb_agg(c.relname ORDER BY c.relname),'[]'::jsonb) AS names,
    COALESCE(jsonb_agg(c.relname ORDER BY c.relname)
      FILTER(WHERE c.relrowsecurity = FALSE),'[]'::jsonb) AS rls_disabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
),
critical_functions AS (
  SELECT COALESCE(jsonb_agg(DISTINCT p.proname ORDER BY p.proname),'[]'::jsonb) AS names
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN('admin_list_orders','create_order','is_admin','subscribe_newsletter')
),
bucket_groups AS (
  SELECT COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE public = FALSE),'[]'::jsonb) AS private_buckets,
    COALESCE(jsonb_agg(id ORDER BY id) FILTER (WHERE public = TRUE),'[]'::jsonb) AS public_buckets
  FROM storage.buckets
)
SELECT jsonb_build_object(
  'schemaVersion',1,
  'publicTables',pt.names,
  'rlsDisabledPublicTables',pt.rls_disabled,
  'criticalFunctions',fn.names,
  'privateStorageBuckets',bg.private_buckets,
  'publicStorageBuckets',bg.public_buckets,
  'metadataOnly',true
) AS inventory
FROM public_tables pt CROSS JOIN critical_functions fn CROSS JOIN bucket_groups bg;
