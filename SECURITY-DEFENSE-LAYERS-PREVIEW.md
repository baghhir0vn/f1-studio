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
| 7. Admin MFA | TOTP QR enrollment, six-digit challenge, optional backup-device registration UI, session refresh checks and a separate `adminMfaEnabled` rollout flag added to **Preview**. `security-admin-mfa-preview.sql` stages AAL2 checks for both admin helpers | JS contract + synthetic SQL role tests passed. **The actual AAL2 database policy is still staged, not activated.** Isolated test Supabase currently has **zero Auth users and zero admin profiles**, so real browser enrollment/verification cannot yet be claimed. |
| 8. Edge traffic WAF/rate limit | **Not configured by this change** | Decide Vercel WAF rules, limits, monitoring thresholds, pricing, and project scope before applying. Firewall changes are typically project-wide and can affect production immediately; avoid unintended impacts |
| 9. Credential/secret boundaries | `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, `SUPABASE_URL` restricted to security Preview branch in Vercel | Separate production keys and Cloudflare widget at launch; never copy test secret to production |
| 10. Incident response + backup | **Not yet implemented** | Document logs, alerts, key rotation, backup/restore tests, emergency shutdown, and rollback |

## Why MFA needs enrollment before activation

Supabase Auth assigns `aal1` to normal one-factor login and `aal2` after a verified MFA factor.
Applying the staged functions today would deny administrators whose sessions are still AAL1. The Preview client UI now provides TOTP enrollment and QR codes, verification, challenge at login, an additional backup-device enrollment path, and a fail-closed admin UI gate. This is **not** itself a security boundary: client-side role/MFA flags can be tampered with. The required AAL2 check must be applied to every privileged DB/RPC/storage path before the production policy is considered enforced.

The isolated test Supabase presently has 0 test users / 0 test admin profiles, so no real Auth MFA enrollment has been run. Do not create a production-like admin in the isolated test project using genuine production credentials. A separate, user-owned synthetic test admin must be created before the live browser smoke test. Supabase TOTP does **not** offer automatic backup recovery codes through this implementation: keep a second independently enrolled device, and prepare an identity-verified manual recovery process in case all devices are lost. Never ask the user to share QR images, TOTP secrets or one-time codes in chat.

Safe order:
1. **Completed in Preview code:** build TOTP QR enrollment, verification, second-device enrollment, and login challenge. **Pending:** real end-to-end verification with a synthetic admin user in the isolated Supabase Auth project.
2. Verify AAL2 JWT behavior through Supabase Auth with the synthetic test admin, and record controlled manual recovery for lost second factors (not a weak automatic bypass).
3. Run the staged helper functions and all admin-facing RLS rules in a disposable / test DB with customer, admin AAL1, admin AAL2 and blocked admin. The synthetic SQL role tests already pass; authenticated client sessions are still pending.
4. Roll out only after admin can recover access. Never downgrade AAL2 silently to resolve a lockout.

Official reference: https://supabase.com/docs/guides/auth/auth-mfa

## Admin MFA implementation evidence
- Preview-only files: `js/admin-mfa.js`, `js/services/admin-mfa-service.js`, `css/admin-mfa.css`, `index.html` dialog. `js/admin.js` denies UI/realtime if the Preview flag requires MFA but the AAL2 session isn't verified. `js/auth.js` prompts after login, checks restored sessions, and clears admin state on cross-tab sign-out.
- Tests: `tools/admin-mfa-ui-test.mjs` mocks the Supabase MFA API, rejects malformed codes, confirms a valid challenge must end with `aal2`, and verifies the UI wiring; `tools/admin-mfa-pg-assertions.sql` verifies staged database admin checks with synthetic tokens. <https://github.com/baghhir0vn/f1-studio/actions/runs/44802929099> succeeded.
- Read-only isolated test project check: `auth.users` count **0** and `public.profiles WHERE role='admin'` count **0**. No real MFA factor, user or secret was created for the tests.
- Preview branch deployed and the hosted dialog + MFA modules were fetched successfully. No live person-scanned QR/code integration test was performed.
- **Production config warning:** `adminMfaEnabled=true` is set in Preview `js/config.js`. Leave it opt-in in production until enrollment, AAL2 database checks, and recovery are validated.

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
