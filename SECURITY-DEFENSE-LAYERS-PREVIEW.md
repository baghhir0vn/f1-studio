# F1 Studio — Defense in Depth (2026-11-20)

**Status:** Engineering staging in `security/preview-order-spam-gateway-20261120`; NO PRODUCTION RELEASE.
**Objective:** Reduce probability and blast radius of credential compromise, order spam, unauthorized data access, and abusive traffic. Security cannot be made absolute.

## Layer status

| Layer | Current implementation | Evidence / remaining work |
|---|---|---|
| 1. HTTPS + security headers | Preview has HSTS, CSP, nosniff, frame denial, referrer and permissions policies in `vercel.json` | Recheck production-equivalent CSP after browser flows; don't blindly enable COEP, which would break third-party widgets |
| 2. Browser bot challenge | Real Cloudflare Turnstile sitekey, dedicated checkout action `order_checkout` | Visible in Preview; end-to-end live token acceptance not yet evidenced |
| 3. API verification | `api/orders.js` validates Origin, request shape, length, trusted Vercel-forwarded IP, optional user JWT, one-use Turnstile response with exact action and hostname | Contract tests passed. No fallback to unverified browser RPC |
| 4. Preview egress isolation | Only `https://dlwjkcqoclvlsyjmrjec.supabase.co` accepted by checkout in Vercel Preview; no userinfo, paths, HTTP or attacker-controlled domains | `tools/order-gateway-contract-test.mjs` passes bad destinations and valid isolated project |
| 5. DB role enforcement | `security-order-gateway-preview.sql` removes browser EXECUTE on original `create_order`; service-only gateway with IP-based SQL rate limiting | Applied only to TEST DB and disposable CI; production still has public old RPC |
| 6. Review spam control | `security-reviews-blocked-users-preview.sql` adds RLS check for blocked customer accounts | Passed disposable PostgreSQL tests; not applied to production or test Supabase (no reviews schema there) |
| 7. Admin MFA | `security-admin-mfa-preview.sql` stages AAL2 requirement for both `public.is_admin()` and `private.is_admin_user()` | CI confirms AAL1 rejected; AAL2 active admin allowed; blocked admin denied. **Not activated** anywhere: first implement TOTP enrollment, recovery, and UI for MFA challenge |
| 8. Edge traffic WAF/rate limit | **Not configured by this change** | Decide Vercel WAF rules, limits, monitoring thresholds, pricing, and project scope before applying. Firewall changes are typically project-wide and can affect production immediately; avoid unintended impacts |
| 9. Credential/secret boundaries | `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, `SUPABASE_URL` restricted to security Preview branch in Vercel | Separate production keys and Cloudflare widget at launch; never copy test secret to production |
| 10. Incident response + backup | **Not yet implemented** | Document logs, alerts, key rotation, backup/restore tests, emergency shutdown, and rollback |

## Why MFA needs enrollment before activation

Supabase Auth assigns `aal1` to normal one-factor login and `aal2` after a verified MFA factor.
Applying the staged functions today would deny administrators whose sessions are still AAL1; the client UI currently has no full admin MFA enrollment/challenge/recovery flow.

Safe order:
1. Build TOTP enrollment, verification and account recovery UI for the chosen admin(s) in isolated test environment.
2. Verify AAL2 JWT behavior through Supabase Auth (not just mocked SQL claims).
3. Test the staged helper functions and all admin-facing RLS rules with customer, admin AAL1, admin AAL2 and blocked admin.
4. Roll out only after admin can recover access. Never downgrade AAL2 silently to resolve a lockout.

Official reference: https://supabase.com/docs/guides/auth/auth-mfa

## WAF decision (not applied to project)

Vercel WAF offers IP/bot/traffic rules and rate limiting. These rules are managed for the Vercel project and may affect live traffic; some features have pricing/plan constraints.
- Choose an explicit scoped rule, e.g. match `/api/orders` and authentication endpoints if backed by actual APIs, **not** all site traffic.
- Initially log to establish normal traffic baseline; then choose thresholds for guest traffic and a 429/challenge action after confirming false-positive impact.
- Do not trust process-memory counters in serverless functions for global rate limiting.
- Review project scope, pricing and planned response; obtain approval before publishing rules.
Official reference: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

## Production release gates

1. Positive browser test of real Cloudflare challenge → Vercel server → guarded Supabase RPC.
2. Negative tests for expired/replayed/wrong-host Turnstile, invalid body, order rate limit, blocked customer and cross-account access; protect against bypass to old RPC.
3. Admin TOTP enrollment/recovery + true AAL2 sessions validated; RLS in production-specific schema reviewed with rollback.
4. Review migrations with the production schema and no stock tracking assumptions; backup and restore exercise, rollout and backout steps.
5. Production-specific Cloudflare widget, env keys, domain, CSP and Supabase URL; remove test-only frontend behavior.
6. Document WAF price, threshold, monitoring owners and false-positive actions; don't silently alter a shared Vercel project's production firewall.
7. Production smoke tests after deploy and monitoring; preserve rollback readiness.
