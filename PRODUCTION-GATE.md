# F1 Studio — Production Security Gate

Run `security-gate-v17.sql` in Supabase SQL Editor. It is read-only.

The important checks are:

- RLS enabled on the app tables.
- Direct `anon` / `authenticated` table grants match the intended app behavior.
- `customer-designs` is private and Storage policies are owner/admin scoped.
- `SECURITY DEFINER` functions pin `search_path` and have narrow EXECUTE permissions.
- `create_order` validates its inputs, derives identity from the JWT, reads trusted product price/stock, and calculates the authoritative total in the database.
- Exposed public views do not leak protected rows.
- Default privileges do not accidentally expose future objects.

Do not run broad policy-changing SQL until the existing results are reviewed.
