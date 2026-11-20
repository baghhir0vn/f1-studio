# F1 Studio — Security Monitoring, Incident Response & Recovery

**Prepared:** 2026-11-20  
**Current stage:** SECURITY PREVIEW ONLY. No production security release/rollback executed.  
**Owners:** site owner/admin (primary), infrastructure owner (Vercel), database owner (Supabase). Assign actual contacts before launch.  
**Production database:** `rfkqxiwbicjsszjbdhzd`.  
**Isolated test database:** `dlwjkcqoclvlsyjmrjec`.  
**Security branch:** `security/preview-order-spam-gateway-20261120`.  
**Stable Preview host:** `f1studio-git-security-preview-orde-9ffb80-nurlanbagirov834-7802.vercel.app`.

## 1. Current evidence and gaps (not aspirational features)

- Vercel Preview deployments are built from the dedicated branch; production is unchanged.
- The checkout and newsletter API responses now emit server-generated `X-Request-ID` (UUID v4) and `Cache-Control: no-store`. The hosted Preview responded HTTP 405 for GET on both POST-only endpoints, with distinct request IDs.
- Application logs emit the fixed marker `F1_SECURITY_EVENT` with **only** `schema`, `scope`, `status`, `code`, `requestId`. Codes are allowlisted; arbitrary service errors, IP addresses, bodies, e-mail addresses, phones, bearer tokens and CAPTCHA tokens are never logged. 429 and 5xx are logged; 401/403 are sampled ~1/16 to mitigate log flooding; other events not logged. This is **not** a complete access or fraud log; Vercel edge/WAF aggregate metrics are needed.
- Vercel WAF has exactly two **Preview-only log rules** matching `POST /api/orders` and `POST /api/newsletter`. No paid rate-limiting/blocking rule is active.
- At inspection, 45-minute Preview runtime logs had no matching error or warning entries and no request-path counts. This **cannot** establish zero security incidents, healthy checkout, or alert delivery.
- Supabase production and isolated test projects returned `ACTIVE_HEALTHY` via project metadata, which alone does not verify backups or data correctness.
- **AUTOMATED ALERT DELIVERY: NOT CONFIGURED.** **BACKUP EXISTENCE, RECENCY AND RESTORE: UNVERIFIED.** Do not say the site can recover until these gates pass.

## 2. Monitoring: signals, tentative thresholds, and minimum response

These are **proposed** thresholds for the initial observation period, **not active alerts** and not a claim of measured baseline traffic.

| Signal | Suggested initial review threshold | Action |
|---|---|---|
| Checkout `429 ORDER_RATE_LIMITED` | >= 3 distinct request IDs in 10 minutes | Check abuse vs shared mobile/carrier NAT; never log customer data |
| Newsletter `429 NEWSLETTER_RATE_LIMITED` | >= 3 in 10 minutes | Confirm IP-capped SQL gateway enabled and old public RPC revoked in target environment |
| Either API `503` | >= 3 in 5 minutes | Check Supabase health, Vercel runtime logs and branch env configuration |
| Checkout `403 CAPTCHA_FAILED` | Upward change in WAF edge metrics | Check hostname / action / credential mismatch before treating as attack; application 403 logs are sampled |
| Backend `502 ORDER_RESPONSE_INVALID` or `NEWSLETTER_RESPONSE_INVALID` | Any sustained occurrence | Verify API response contracts, isolated DB gateway and migrations |
| GitHub Actions security workflow failure | Any required security job fails on release commit | **Do not promote** until fixed and a clean run completes |
| Missing 24h backup or unrecoverable restore | Any missing proof before release | **Block production migration**; verify backup or perform a separately approved export and restore drill |

Actual alert routing (e-mail/Slack/pager) must be configured by the owner in Vercel, GitHub and/or an authorized monitoring provider; this repository does not claim to send notifications.

### Safe log review

1. Filter **Vercel Runtime Logs** by the exact `f1_studio` project, environment **preview**, and recent time window. Search `F1_SECURITY_EVENT`, group by `requestPath` / `level`, and compare to WAF request metrics. Restrict who can view runtime logs.
2. Use `X-Request-ID` from a user-visible error response to correlate with application logs. Never request that a customer send passwords, bearer tokens, CAPTCHA tokens, TOTP codes, QR codes, card details, or a screen recording showing any of those.
3. The application log deliberately stores **no source IP or customer identity**. Investigate volumes via provider aggregates and minimize retention/permission scope in provider consoles.
4. Inspect relevant Supabase logs and migrations **read-only** for query/auth errors. Don't print credentials or personal records in support tickets.

## 3. Incident classification and response

- **SEV-1 — urgent:** confirmed admin takeover, exposure of private customer data/keys, arbitrary order creation bypass, or sustained loss of checkout with customers affected. Escalate to site owner immediately, restrict the affected function or access, preserve safe metadata, rotate affected credentials **after** containment plan, and notify impacted parties when legally required.
- **SEV-2 — high:** bot-driven abuse, significant 429/503 spikes, account brute force, or degraded checkout without confirmed data leak. Inspect production vs Preview scope and current changes; apply smallest reversible mitigation with operator approval.
- **SEV-3 — medium:** intermittent captcha failure, slow API responses, noisy but unsuccessful probes. Record an issue, verify false positives, gather non-sensitive evidence.

### First-response steps (no destructive action by default)

1. **Identify exact environment, hostname, Git SHA/deployment ID, time window and affected route.** Never assume a Preview finding exists in Production.
2. **Scope impact:** affected order/newsletter endpoint, Auth, customer files, admin panel, Supabase database; differentiate API errors from customer browser errors.
3. **Preserve metadata:** `requestId`, `scope`, `status`, `code`, deployment hash, sanitized timestamps and count. Do not export full HTTP request bodies or personal user records.
4. **Contain safely:** for a Preview-only issue, restrict the matching Preview rule or stop Preview promotion; a project-level Vercel firewall change may otherwise affect production. Request explicit authorization for production mitigation except an immediate emergency requiring the site owner's established incident procedure.
5. **Fix and verify in isolation:** run reproducible synthetic CI tests, then real Preview browser smoke tests, including error handling.
6. **Recover and monitor:** record change, validate ordinary checkout, legitimate login, storage access and newsletter registration, continue observing errors and false positives.

## 4. Backup and restore gate — MANDATORY before production release

**Verification state: NOT VERIFIED** — the Supabase connector exposes project health/migrations but no proof here of actual recent backups or successful restoration. The current production plan and availability of backups/PITR are not established.

- Confirm the actual production project's **Database → Backups** view, retention and latest restorable date/time. Per Supabase documentation, automatic daily backups are available for **Pro/Team/Enterprise**; **Free** projects should regularly export using `supabase db dump` to encrypted off-site storage.
- For loss scenarios, don't assume database restore includes **Storage object files**. Check and separately back up `customer-designs`, `customer-avatars`, `product-images`, `site-content` with access controls and minimal retention. Supabase clone/restore-to-new-project documentation states Storage objects are **not** copied by that feature.
- Before an **approved** production schema migration, record backup timestamp, expected RPO/RTO, secret owner, release commit, SQL migration, restore target, impact window and rollback criteria.
- Perform a test-only restore into a separate project or another authorized isolated environment to validate schema, data integrity and private Storage. Never restore over production as a test.
- **Rollback distinction:** Vercel code rollback alone does **not** reverse a Supabase SQL migration. Database rollback requires separately reviewed, tested down-migration or point-in-time restore plan; never assume undo is safe. Rolling back Vercel may change automatic domain assignment and require explicit promotion.
- **No automatic credential rotation:** rotating Supabase, Turnstile or admin secrets requires coordinated Vercel/env changes and post-rotation smoke checks; don't put the new secret into Github, a screenshot or a log.

Official references: [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups), [Supabase Restore to a New Project](https://supabase.com/docs/guides/platform/clone-project), [Vercel Deployments](https://vercel.com/docs/deployments).

## 5. Minimal production deployment and rollback checklist

- [ ] Site owner explicitly approves the target production release.
- [ ] Production backup date, retention and **restore rehearsal** verified.
- [ ] Production-specific Cloudflare widget/domain/secrets and database destination confirmed; no test keys copied.
- [ ] Original anonymous order and newsletter RPCs have coordinated, tested revocation paired with Vercel server functions.
- [ ] Admin MFA real test with synthetic users, AAL2 JWT and recovery path completed before enforcing production SQL AAL2.
- [ ] Pending review RLS migration validated against the exact production schema.
- [ ] All CI security jobs pass for the **exact release commit**. Green CI does not by itself guarantee branch protection.
- [ ] Preview browser smoke tests pass for real one-use Turnstile, order, newsletter, admin login/MFA and customer file access.
- [ ] WAF blocking and rate-limiting plans/pricing/false-positive handling reviewed and explicitly approved.
- [ ] Assigned alert owner and notification destination tested. **Currently not configured.**
- [ ] Rollback plan covers both code **and** database migrations.
- [ ] Post-release smoke tests and 24-hour observation ownership established.

**Release remains BLOCKED pending these operational gates.** The checklist is documentation, not an automatically enforced GitHub branch-protection rule.
