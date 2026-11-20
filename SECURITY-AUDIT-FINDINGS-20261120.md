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

## Reviewed, not proven vulnerabilities
- **Admin RPC exposure to `authenticated`:** `admin_list_orders`, `admin_list_newsletter_subscribers`, `admin_reorder_products`, `admin_set_order_status` are callable by signed-in users, but their inspected definitions call `public.is_admin()` first. `public.is_admin()` checks the current `auth.uid()` against `profiles.role='admin'` and `blocked=false`. This appears to provide a real authorization check; a cross-role negative test is still recommended. Do **not** report this as a confirmed admin takeover.
- **Public table RLS:** All eight examined `public` tables have RLS enabled. Public rows are intentionally readable for active products, approved reviews, and site settings. Admin changes have admin-checking policies. No broad unauthenticated write grant was observed in examined table permissions.
- **RLS enabled without policies:** Four tables named by advisor `rls_enabled_no_policy` have default-deny behavior. This is an INFO notice, **not** evidence of data exposure by itself.
- **Storage:** `customer-avatars` and `customer-designs` are private. `product-images` and `site-content` are public by design. Inspected storage policies restrict customer design ownership and admin product uploads. Full upload/download penetration testing not yet performed.
- **Frontend secret check:** Reviewed default-branch `js/config.js`; no `sb_secret_` or service-role key literal found. This is not a repository-wide secret scan.
- **Production function robustness:** The `create_order` body includes an inner variable named `rate_key` and SQL uses a same-named column. A corresponding naming ambiguity was corrected and tested in the separate test DB, but not executed against production as part of this read-only audit.

## Verification and limitations
- Supabase Security Advisor as of 2026-11-20: warnings for public/security-definer RPC execution, signed-in/security-definer RPC execution, and disabled leaked-password protection; INFO for default-deny RLS tables.
- SQL inspected table grants, `pg_policies`, `pg_proc` EXECUTE and SECURITY DEFINER, SQL function definitions, and storage bucket policy metadata.
- No claim of a complete penetration test, no user-login matrix verification, and no proven browser-to-Cloudflare-to-database production-equivalent checkout yet.
- Preview branch changes and test keys stay isolated from production. Any production rollout requires a separate Cloudflare widget, environment secrets, reviewed database migration, backout plan, and explicit approval.

## Prioritized next work
1. Finish end-to-end Preview checkout and database gateway authorization/abuse checks.
2. Build and test a newsletter abuse-protection change in the isolated environment.
3. Test non-admin, blocked user, and admin access boundaries without using real customer data.
4. Audit authentication, storage file ownership, and remaining frontend/API entry points; track each finding with risk and test evidence.
5. Release only tested changes to production after explicit approval and backup/rollback arrangements.
