# F1 Studio — Security Audit Findings (Phase 1)
**Audit date:** 2026-11-20
**Scope:** Production Supabase `rfkqxiwbicjsszjbdhzd`, read-only metadata, policy, and function-definition inspection. Preview branch `security/preview-order-spam-gateway-20261120` is the remediation staging area.
**Safety:** No production schema, policies, functions, records, deployment, or secrets changed. No customer records read or altered. No external unauthenticated attack probes.

## Confirmed findings

### F1-S-001 — HIGH — Direct guest invocation of privileged checkout RPC
- **Location:** `public.create_order(jsonb,text,text,text,text,text,boolean,boolean)`, callable through `/rest/v1/rpc/create_order`.
- **Evidence:** `has_function_privilege('anon', ..., 'EXECUTE') = true`; security advisor `anon_security_definer_function_executable` flags it; `SECURITY DEFINER = true`.
- **Impact:** A public client can call the underlying order creator without passing the web UI's Cloudflare challenge. The function **does** implement input checks and an order rate limiter, so no claim is made that it is entirely unprotected or that an attack succeeded. Potential for automated unsolicited orders and workload if abused.
- **Remediation prepared in Preview:** `api/orders.js` checks Origin, IP, real Turnstile action + exact hostname and forwards to a guarded `create_order_gateway` RPC. `security-order-gateway-preview.sql` revokes direct browser execution. Verified in isolated test DB / CI; not yet deployed to production.
- **Next validation:** Complete browser Turnstile → checkout POST → verified test order end-to-end; then production-specific configuration and cutover in a reviewed release.

### F1-S-002 — MEDIUM (abuse hardening) — Public newsletter RPC without visible rate limiting
- **Location:** `public.subscribe_newsletter(text)`.
- **Evidence:** Anonymous EXECUTE granted; `SECURITY DEFINER`; source validates email length/shape and deduplicates emails, but implements no explicit throttling or CAPTCHA verification.
- **Impact:** Potential newsletter signup spam / unnecessary processing. This function may intentionally be public; anonymous access alone is not proof of an authorization flaw.
- **Action:** If feature remains enabled, add independently tested rate limiting/abuse defense without breaking legitimate subscribers.

### F1-S-003 — MEDIUM — Leaked-password protection disabled
- **Evidence:** Supabase security advisor `auth_leaked_password_protection` WARN.
- **Action:** Review Supabase Auth password policy and enable leaked-password protection if available for the current project plan. Do not change live authentication settings without testing user impact first.
- **Official guidance:** https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

### F1-S-004 — MEDIUM — Blocked user can bypass client-only review submission ban
- **Location:** Production RLS policy `public.reviews` → `"reviews public insert"`, client `js/services/review-service.js`.
- **Evidence:** `authenticated` role has `INSERT` on `public.reviews`. The current INSERT policy allows a pending review when `user_id=auth.uid()` and author/text validate, but **does not inspect** `public.profiles.blocked`. Meanwhile the frontend `reviewService.submit()` rejects blocked accounts only in JavaScript.
- **Impact:** A blocked account with an unexpired authenticated Supabase session can submit new pending reviews directly via the Data API, bypassing client restrictions. This does not grant admin access or auto-approve reviews.
- **Preview-only fix:** `security-reviews-blocked-users-preview.sql` retains the original owner/status/length guards and additionally requires no blocked profile row for the requesting user.
- **Evidence for staged fix:** `tools/reviews-blocked-pg-assertions.sql` passes in GitHub Actions with a fully disposable PostgreSQL instance: allows a normal pending review; denies a blocked user, spoofed owner ID, and direct approval. **Not yet installed in live Supabase or the separate test Supabase**, whose schema currently lacks a reviews table.

## Reviewed, not proven vulnerabilities
- **Admin RPC exposure to `authenticated`:** `admin_list_orders`, `admin_list_newsletter_subscribers`, `admin_reorder_products`, `admin_set_order_status` are callable by signed-in users, but their inspected definitions call `public.is_admin()` first. `public.is_admin()` checks the current `auth.uid()` against `profiles.role='admin'` and `blocked=false`. A read-only transaction in production with a verified nonexistent synthetic user ID confirmed `is_admin=false`, `admin_list_orders(1)` rejected with `ADMIN_REQUIRED`, and no orders visible. Other admin RPCs were inspected statically, not executed on live data. **Do not report this as a confirmed admin takeover.**
- **Public table RLS:** All eight examined `public` tables have RLS enabled. Public rows are intentionally readable for active products, approved reviews, and site settings. Admin changes have admin-checking policies. No broad unauthenticated write grant was observed in examined table permissions.
- **RLS enabled without policies:** Four tables named by advisor `rls_enabled_no_policy` have default-deny behavior. This is an INFO notice, **not** evidence of data exposure by itself.
- **Storage:** `customer-avatars` and `customer-designs` are private. `product-images` and `site-content` are public by design. Inspected storage policies restrict customer design ownership and admin product uploads. Full upload/download penetration testing not yet performed.
- **Frontend secret check:** Reviewed default-branch `js/config.js`; no `sb_secret_` or service-role key literal found. This is not a repository-wide secret scan.
- **Production function robustness:** The `create_order` body includes an inner variable named `rate_key` and SQL uses a same-named column. A corresponding naming ambiguity was corrected and tested in the separate test DB, but not executed against production as part of this read-only audit.

## Authorization test phase — 2026-11-20
- **Production, read-only negative test:** In a `READ ONLY` PostgreSQL transaction, simulated a nonexistent authenticated UUID and `SET LOCAL ROLE authenticated`. Assertions confirmed `public.is_admin()=false`, `public.admin_list_orders(1)` yields `ADMIN_REQUIRED`, and the role sees 0 other orders through RLS. Transaction rolled back; no production records altered or disclosed.
- **Synthetic positive/negative matrix:** `tools/admin-authorization-pg-assertions.sql` builds disposable `profiles` and `orders` fixtures with copied relevant RLS predicates and a corresponding `is_admin()` guard. Tests show ordinary users cannot access other orders or promote their own role, blocked users cannot unblock themselves, blocked admins have no admin privileges, and active admins retain required access. These fixtures **model** production authorization; they are not live logins.
- **Evidence:** GitHub Actions [run 68](https://github.com/baghhir0vn/f1-studio/actions/runs/44798344812) passed authorization matrix; [run 74](https://github.com/baghhir0vn/f1-studio/actions/runs/44798844325) passed authorization matrix, staged review RLS, checkout gateway, and Preview isolation tests.

## Verification and limitations
- Supabase Security Advisor as of 2026-11-20: warnings for public/security-definer RPC execution, signed-in/security-definer RPC execution, and disabled leaked-password protection; INFO for default-deny RLS tables.
- SQL inspected table grants, `pg_policies`, `pg_proc` EXECUTE and SECURITY DEFINER, SQL function definitions, and storage bucket policy metadata.
- No claim of a complete penetration test: full authenticated browser tests (real test-user sessions, blocked/active admin, Realtime, Storage) remain, as does a proven browser-to-Cloudflare-to-database end-to-end checkout.
- Preview branch changes and test keys stay isolated from production. Any production rollout requires a separate Cloudflare widget, environment secrets, reviewed database migration, backout plan, and explicit approval.

## Prioritized next work
1. Finish end-to-end Preview checkout and database gateway authorization/abuse checks.
2. Build and test a newsletter abuse-protection change in the isolated environment.
3. Extend the production-equivalent isolated Supabase fixture with test-only auth users and review/admin schema, then run browser-based cross-role and storage checks; the disposable PostgreSQL matrix passed.
4. Audit authentication, storage file ownership, and remaining frontend/API entry points; track each finding with risk and test evidence.
5. Release only tested changes to production after explicit approval and backup/rollback arrangements.
