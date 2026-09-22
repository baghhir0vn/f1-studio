# Supabase security gate

This folder contains read-only audit queries and a hardening script. Do not run broad policy changes blindly against production.

Before switching the Vercel deployment, run `policy-audit-v10.sql` and `audit-create-order.sql` in Supabase SQL Editor and review:

1. `anon` must not have SELECT/INSERT/UPDATE/DELETE privileges on private customer/order/profile data.
2. `create_order` must not trust client-supplied price or stock. It should resolve products and prices from the database and perform stock checks atomically.
3. `customer-designs` must be private and owner/admin-scoped.
4. Admin-only tables/functions must be protected by RLS/grants/function privileges, not only frontend checks.

The frontend cannot prove these backend properties.
