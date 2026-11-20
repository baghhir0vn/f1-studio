# F1 Studio — Defense in Depth (2026-11-20)

**Status:** Engineering staging in `security/preview-order-spam-gateway-20261120`; NO PRODUCTION RELEASE.
**Objective:** Reduce probability and blast radius of credential compromise, order spam, unauthorized data access, and abusive traffic. Security cannot be made absolute.

## Layer status

| Layer | Current implementation | Evidence / remaining work |
|---|---|---|
| 1. HTTPS + security headers | Preview has HSTS, CSP, nosniff, frame denial, referrer and permissions policies in `vercel.json` | Recheck production-equivalent CSP after browser flows; don't blindly enable COEP, which would break third-party widgets |
| 2. Browser bot challenge | Real Cloudflare Turnstile sitekey, dedicated checkout action `order_checkout` | Visible in Preview; end-to-end live token acceptance not yet evidenced |
| 3. API verification | `api/orders.js` validates Origin, request shape, length, trusted Vercel-forwarded IP, optional user JWT, one-use Turnstile response with exact action and hostname | Contract tests passed. No fallback to unverified browser RPC |
| 4. Environment-bound checkout isolation | Exact Supabase project allowlist now enforced in **both** Vercel Preview (`dlwjkcqoclvlsyjmrjec`) and Production (`rfkqxiwbicjsszjbdhzd`) by `api/orders.js`; unknown Vercel environments fail closed | Extra contract tests reject cross-project checkout writes, HTTP, credentials in URLs, arbitrary Supabase tenants, and unknown deployment environments. Production code not deployed. |
| 5. DB role enforcement | `security-order-gateway-preview.sql` removes browser EXECUTE on original `create_order`; service-only gateway with IP-based SQL rate limiting | Applied only to TEST DB and disposable CI; production still has public old RPC |
| 6. Review spam control | `security-reviews-blocked-users-preview.sql` adds RLS check for blocked customer accounts | Passed disposable PostgreSQL tests; not applied to production or test Supabase (no reviews schema there) |
| 7. Admin MFA | Preview TOTP QR + six-digit challenge + optional backup-device path. AAL2 checks in `public.is_admin()` and `private.is_admin_user()` were **installed in the isolated TEST Supabase project only** via `security-admin-mfa-test-project.sql`. | Test DB has no real users/admin profiles; synthetic AAL1 and non-admin AAL2 were denied. CI real controller tests now cover canceled QR and stale responses across logout/same-account re-login. **Production has NOT enabled AAL2.** |
| 8. Edge traffic WAF/rate limit | **Two active LOG-ONLY rules**, scoped to the exact security Preview host, for `POST /api/orders` and `POST /api/newsletter`. | WAF configuration v2, no blocking or paid rate limiting. Rules `rule_f1_security_preview_checkout_audit_logs_only_drlObD` and `rule_f1_security_preview_newsletter_audit_logs_only_djjPrd`. |
| 9. Credential/secret boundaries | `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, `SUPABASE_URL` restricted to security Preview branch in Vercel | Separate production keys and Cloudflare widget at launch; never copy test secret to production |
| 10. Incident response + backup | Privacy-minimal server audit events, request correlation and incident response runbook prepared. Review `SECURITY-INCIDENT-RECOVERY-RUNBOOK.md`. | Hosted Preview GET smoke tests confirm random `X-Request-ID`, no-store and valid POST-only 405. CI verifies audit logs exclude PII. **Live alert delivery and actual backup/restore remain UNVERIFIED / not configured**; production deployment blocked until operational gates are met. |
| 11. Newsletter bot abuse | Frontend now posts to `api/newsletter.js` instead of calling the anonymous Supabase RPC. `security-newsletter-gateway-preview.sql` revokes direct browser EXECUTE and atomically enforces max 8 signup attempts per trusted IP per 15 minutes. | Applied to isolated test Supabase only, synthetic signup and limit verified in a rolled-back transaction. CI tests endpoint and SQL grants. Legacy public RPC remains enabled in production until coordinated cutover. |

## Hourly security watch and production-release safeguards (2026-11-21)

- An hourly ChatGPT condition-watch automation was enabled for *read-only* review of Vercel Preview errors, the two Preview-only WAF logging rules, Supabase project health and the GitHub `Order gateway security tests` workflow. It should send notification only when genuine new anomalies appear. **Execution and delivery are not yet verified.** It is not instant, continuous, or a provider-native incident pager.
- The monitor explicitly ignores the **EXPECTED** red `Production security release readiness` workflow, which is intentionally blocked while operational evidence is missing; ordinary GitHub security regression workflow failures still matter.
- `security-production-release-evidence.json` has all release checks marked unverified, including last production backup, restore rehearsal, object backups, AAL2 test, genuine browser tests, alert delivery, owner approval and cutover rollback.
- `tools/security-release-readiness.mjs` and `tools/security-release-readiness-test.mjs` fail closed on incomplete evidence, stale backup, wrong production targets and nonmatching SHA. Standard Preview security CI passes the validator tests.
- `.github/workflows/security-production-release-gate.yml` adds a production-targeted PR check which **fails intentionally** until release proof is present. GitHub Actions run `44808078501` failed with `PRODUCTION RELEASE BLOCKED: 13 missing/stale attestations` while the normal security suite passed. This is a desired safety stop, not a vulnerability.
- **Warning:** GitHub branch protection could not be inspected through the integration (403), and no repository rulesets were returned. The PR check is not guaranteed to block merges unless made required by branch protection. No protection settings were modified.
- The checklist is human-attested evidence and does not create a real backup automatically. No production deployment, Supabase production SQL migration or paid WAF rule was applied.

## Monitoring / recovery deliverables (2026-11-20)

- Shared backend module `server/security-observability.js` generates random UUIDv4 request IDs for both API endpoints. Only allowlisted categorical security events reach Vercel runtime logs. The complete order/newsletter contract tests and `tools/security-observability-test.mjs` pass in GitHub CI; hosted GET tests confirm two distinct `X-Request-ID` headers and no-store on the stable Preview host.
- `SECURITY-INCIDENT-RECOVERY-RUNBOOK.md` documents concrete symptoms, proposed detection thresholds, read-only investigation, SEV-1/2/3 response, isolating Preview vs Production, exact source-of-truth objects and safety checks for code / SQL rollbacks.
- **Open risks:** a ChatGPT hourly condition-watch was configured but first-run/delivery remain unverified, no provider-native instant email/pager route is configured, no measured legitimate traffic baseline, no proof of production backup availability or successful restore, and no assigned backup operator. These are explicit production release blockers.
- Supabase documents state backup retention varies by plan. See https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/guides/platform/clone-project. Don't assume storage files are included in a restored database.

## Newsletter security evidence — isolated Preview only

- **Confirmed production gap:** `public.subscribe_newsletter(text)` was anonymous-executable and had no per-IP throttling. It validates email format and deduplicates addresses, so this is an abuse-hardening issue rather than proven data theft.
- **Preview fix:** `js/services/newsletter-service.js` calls same-origin `POST /api/newsletter`; the backend rejects invalid Origin, body, IP, or Supabase target and calls service-only `public.subscribe_newsletter_gateway(text,text)`. The gateway uses an atomic PostgreSQL UPSERT for 8 attempts/15 minutes/IP. No SQL/secret details are returned publicly.
- **Isolated Supabase tests:** Empty subscriber table created via `security-newsletter-test-bootstrap.sql`, followed by `security-newsletter-gateway-preview.sql`. A read-only access check confirmed both legacy and gateway RPCs deny anonymous execution; `service_role` can invoke the gateway. A `BEGIN...ROLLBACK` test verified normal subscription, duplicate handling, 9th attempt rejection, and a separate IPv6 address's ability to subscribe. No test subscribers or rate records persisted.
- **Hosted API smoke test:** GET `/api/newsletter` returned HTTP 405, verifying the Vercel server route exists; full POST browser end-to-end remains pending.
- **CI tests:** `tools/newsletter-gateway-contract-test.mjs`, `tools/newsletter-gateway-pg-assertions.sql`, and the disposable PostgreSQL fixture verify fail-closed error handling, privacy response, public-RPC revocation, and 8-attempt rate limit.
- **WAF observation:** Added second exact-host Preview-only `log` rule: `rule_f1_security_preview_newsletter_audit_logs_only_djjPrd`; other WAF conditions identical to checkout observer. **No rate-limit action or live-site blocking.**
- **Remaining work:** Review legitimate users behind shared NAT, establish retention/deletion policy for IP rate-limit entries (stored in a private RLS table), verify production-specific schema before release, and consider a dedicated Turnstile action for newsletter after browser testing. Production still has the old public RPC and **must not** be described as fixed.

## Why MFA needs enrollment before activation

Supabase Auth assigns `aal1` to normal one-factor login and `aal2` after a verified MFA factor.
Applying the staged functions today would deny administrators whose sessions are still AAL1. The Preview client UI now provides TOTP enrollment and QR codes, verification, challenge at login, an additional backup-device enrollment path, and a fail-closed admin UI gate. This is **not** itself a security boundary: client-side role/MFA flags can be tampered with. The required AAL2 check must be applied to every privileged DB/RPC/storage path before the production policy is considered enforced.

The isolated test Supabase still has 0 test users / 0 test admin profiles, so no real Auth MFA enrollment has been run. The TEST DB now has AAL2-aware helper functions only: this does not magically create or protect missing admin tables/policies. Do not create a production-like admin in the isolated test project using genuine production credentials. A separate, user-owned synthetic test admin must be created before the live browser smoke test. Supabase TOTP does **not** offer automatic backup recovery codes through this implementation: keep a second independently enrolled device, and prepare an identity-verified manual recovery process in case all devices are lost. Never ask the user to share QR images, TOTP secrets or one-time codes in chat.

Safe order:
1. **Completed in Preview code:** build TOTP QR enrollment, verification, second-device enrollment, and login challenge. **Pending:** real end-to-end verification with a synthetic admin user in the isolated Supabase Auth project.
2. Verify AAL2 JWT behavior through Supabase Auth with the synthetic test admin, and record controlled manual recovery for lost second factors (not a weak automatic bypass).
3. Run the staged helper functions and all admin-facing RLS rules in a disposable / test DB with customer, admin AAL1, admin AAL2 and blocked admin. The synthetic SQL role tests already pass; authenticated client sessions are still pending.
4. Roll out only after admin can recover access. Never downgrade AAL2 silently to resolve a lockout.

Official reference: https://supabase.com/docs/guides/auth/auth-mfa

## Admin MFA implementation evidence
- Preview-only files: `js/admin-mfa.js`, `js/services/admin-mfa-service.js`, `css/admin-mfa.css`, `index.html` dialog. `js/admin.js` denies UI/realtime if the Preview flag requires MFA but the AAL2 session isn't verified. `js/auth.js` prompts after login, checks restored sessions, and clears admin state on cross-tab sign-out.
- Tests: `tools/admin-mfa-ui-test.mjs` validates TOTP API adapter, and `tools/admin-mfa-controller-test.mjs` exercises the real controller under simulated session races. `tools/admin-mfa-pg-assertions.sql` verifies AAL2 rules on disposable PostgreSQL. `tools/security-baseline-test.mjs` prevents public secret exposure and CSP regressions. See the latest GitHub Actions workflow on the security Preview branch.
- Read-only isolated test project check: `auth.users` count **0** and `public.profiles WHERE role='admin'` count **0**. No real MFA factor, user or secret was created for the tests.
- Preview branch deployed and the hosted dialog + MFA modules were fetched successfully. No live person-scanned QR/code integration test was performed.
- **Production config warning:** `adminMfaEnabled=true` is set in Preview `js/config.js`. Leave it opt-in in production until enrollment, AAL2 database checks, and recovery are validated.

## Deployed isolated-test and WAF findings (2026-11-20)

- Test Supabase project: `dlwjkcqoclvlsyjmrjec`, not the production database. Migration `preview_admin_totp_aal2_helpers_20261120` created/secured `public.is_admin()` and `private.is_admin_user()`. Both inspect signed Supabase JWT `aal=aal2` plus profile admin role and blocked status; neither grants anonymous EXECUTE. Read-only negative verification was successful. The test DB has zero user/admin profiles, so a real positive AAL2 browser session is pending.
- Production Supabase was checked read-only afterwards and still has the previous helper (`production_mfa_sql_active=false`). No real customer database schema was changed.
- Vercel project `f1_studio` previously had `configured:false` (no custom WAF config). The first narrow, non-blocking LOG rule was added to the project's firewall and confirmed via read-back. Rule ID: `rule_f1_security_preview_checkout_audit_logs_only_drlObD`. Conditions **AND**: `environment eq preview`, `host eq f1studio-git-security-preview-orde-9ffb80-nurlanbagirov834-7802.vercel.app`, `method eq POST`, `path eq /api/orders`. No customer traffic was intentionally generated to test the rule.
- **Emergency rollback:** remove only this exact WAF rule ID using Vercel Firewall configuration, do not overwrite the entire project firewall. A log-only rule does not block traffic, but its project-level configuration remains shared.
- **Next WAF change requires pricing review:** rate limiting on the endpoint can incur a bill; follow Vercel docs and observe a normal traffic baseline before setting limits. No paid rule or aggressive challenge was enabled.
- Added CI `tools/security-baseline-test.mjs` to scan browser-delivered files for secret keys, reject production database URLs in Preview, and fail on weakened CSP/security headers.
- Added behavior-based `tools/admin-mfa-controller-test.mjs` to reject late MFA enrollment/verification replies after cancellation, logout, and same-admin re-login. The controller increments a generation counter and fails closed on stale responses.

## Next safe WAF candidate — NOT APPLIED

- Candidate file: `security-waf-rate-limit-candidate.json`, verified by `tools/waf-proposal-test.mjs` in CI. It is **not** a deployed WAF rule or an activation instruction.
- Exact scope: Preview environment **AND** dedicated security Preview host **AND** POST **AND** `/api/orders`.
- Provisional threshold: **20 requests per IP per 60 seconds**, fixed window; initial excess action `log`, not block. This is a starting hypothesis, **not** a measured safe limit and not yet independently approved.
- Actual WAF still has only one logging rule. No rate limiting and no new charge-eligible WAF rule has been enabled.
- Vercel rate-limiting pricing depends on the plan and billing usage; first-time setup prompts pricing review. Official information: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Required first: determine normal order traffic rate, assess shared IP/NAT, review plan and billing impact, test false positives in isolation, get user approval, and retain a rollback mechanism.
- Avoid trying to rate-limit frontend-only virtual paths like `/api/auth/login` at Vercel: login uses `sb.auth.signInWithPassword()` and reaches Supabase Auth directly. Supabase has its own auth endpoint limits; those need a separate verification.

## WAF rollout plan (rate limiting NOT applied)

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
