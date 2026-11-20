#!/usr/bin/env bash
# Disposable PostgreSQL-only restore drill. This file NEVER touches Supabase.
# It is intentionally hardcoded to CI's synthetic local gateway_test DB.
set -euo pipefail
if [[ "${PGHOST:-}" != "localhost" || "${PGDATABASE:-}" != "gateway_test" ||
      "${PGUSER:-}" != "postgres" || "${PGPASSWORD:-}" != "synthetic-test-password" ]]; then
  echo "REFUSED: synthetic-only restore rehearsal cannot run against a nonlocal database" >&2
  exit 2
fi

tmp_root="${RUNNER_TEMP:-/tmp}"
archive="$(mktemp "${tmp_root}/f1-synthetic-restore-XXXXXXXX.dump")"
restore_db="f1_restore_drill_$$"
cleanup(){
  rm -f "$archive"
  dropdb --if-exists "$restore_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# All rows below are fictional, and no personal data or production secret is read.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE public.restore_drill_synthetic (
  id integer PRIMARY KEY,
  marker text NOT NULL
);
ALTER TABLE public.restore_drill_synthetic ENABLE ROW LEVEL SECURITY;
INSERT INTO public.restore_drill_synthetic(id,marker)
  VALUES(1,'SYNTHETIC_RESTORE_PROOF_NOT_CUSTOMER_DATA');
SQL

pg_dump --format=custom --no-owner --no-acl \
  --table=public.restore_drill_synthetic --file="$archive"
test -s "$archive"
createdb "$restore_db"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$restore_db" "$archive"

result="$(psql -X -At -d "$restore_db" -v ON_ERROR_STOP=1 -c "
 SELECT (SELECT count(*) FROM public.restore_drill_synthetic)=1
    AND (SELECT marker FROM public.restore_drill_synthetic WHERE id=1)
       ='SYNTHETIC_RESTORE_PROOF_NOT_CUSTOMER_DATA'
    AND (SELECT relrowsecurity FROM pg_class
           WHERE oid='public.restore_drill_synthetic'::regclass)=true
")"
if [[ "$result" != "t" ]]; then
  echo "FAIL: isolated restore didn't recover synthetic row or RLS" >&2
  exit 1
fi
echo "PASS: synthetic pg_dump archive restored into a different throwaway database; row and RLS verified. Real production backup NOT verified."
