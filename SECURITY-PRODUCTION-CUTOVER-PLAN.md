# F1 Studio — staged production security cutover (NOT EXECUTED)

Date: 2026-11-21. Repo `baghhir0vn/f1-studio`; security Preview branch `security/preview-order-spam-gateway-20261120`.
This is an operations plan, **not** proof of completed deployment. Only the site owner should authorize the final maintenance window.

## Mandatory release prerequisites (all must be verified, never guessed)

1. Independently exported **production** SQL roles/schema/data (include Auth where required), encrypted backup, separate actual Storage object-byte exports for all four buckets, inventory, and a successful restore to a separately protected empty destination. Never reuse the existing non-clone security TEST project for real customer records.
2. Real checkout, signup, newsletter, storage upload/download and TOTP/AAL2 tests in an environment with equivalent tables, Storage buckets and authentic test users. Current isolated TEST Supabase lacks a real admin and required buckets/tables.
3. Production-specific Vercel `SUPABASE_URL`, backend-only `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY` and a Cloudflare widget allowing the actual production host. Verify secrets without showing values in logs or screenshots. Preview credentials must never be copied into production.
4. AAL2 enrollment/recovery demonstration **before** activating `security-admin-mfa-preview.sql`. Production admin login cannot be locked out during the rollout.
5. Successful normal security CI on the **exact** release SHA, explicit owner release approval, verified branch protection / required release checks, realistic SQL rollback and Vercel rollback plan, and proof an alert was delivered. Update `security-production-release-evidence.json` only with genuine evidence.
6. Subscription privacy must remain generic; review/upload quotas must not block normal customers; review all database migrations on production-equivalent restore.

## Coordinated order — prevents an unnecessary storefront outage

**Phase A (backward-compatible DB prep):** With a verified backup already secured, review and run `security-production-prestage-preview.sql` on the production database. It creates new service-only `create_order_gateway` and `subscribe_newsletter_gateway` functions and newsletter rate-limit storage **without revoking** the old browser-facing functions. Old production code keeps working. Confirm gateway EXECUTE belongs only to `service_role`.

**Server/code switch:** Review and deploy the security Preview source (after separately removing test-only `securityPreview: true`, pinning the production Supabase URL, Cloudflare Turnstile host/action, configuring production secrets and completing tests). The frontend must now call same-origin `/api/orders` and `/api/newsletter`; keep client publishable keys only in browser. Verify a real non-destructive/synthetic checkout and newsletter flow on a production-equivalent environment and then one supervised legitimate checkout in production. Do not inject fake production orders or subscriber email lists for testing. Observe 4xx/5xx and customer functionality. If broken, stop before Phase B and roll back application code safely.

**Phase B (close bypass):** Only after the new deployed API is working and owner authorizes, run `security-production-lockdown-preview.sql`: revoke browser roles' `EXECUTE` on `create_order` and `subscribe_newsletter`. Confirm `anon` and `authenticated` cannot execute either old RPC, while `service_role` can execute both new gateways. If code rollback to old browser version becomes necessary, the legacy RPC grant change must be explicitly assessed because restoring old browser calls revives the spam loophole.

**Other DB controls:** Separately review and apply `security-reviews-blocked-users-preview.sql` (blocked users and 5 reviews per 24h), `security-customer-designs-quota-preview.sql` (per-customer 50 design objects; concurrency races remain possible), `security-site-content-path-fix-preview.sql` (valid asset names). Validate actual customer data and Storage operations after every migration. They are **not** currently applied to production.

**Admin MFA activation:** Make real admin enroll TOTP and a second independent recovery method. Verify fresh JWT AAL2, lost-device recovery, AAL1 denial, banned admin denial. Then atomically deploy enforced admin UI and `security-admin-mfa-preview.sql` to production. Never run AAL2 DB migration before enrollment or recovery proof.

**Traffic controls:** Review legitimate mobile carrier / shared-IP traffic. Add or adjust production WAF blocking/rate-limiting only after validating plan costs, thresholds and false positives. Existing two custom rules are Preview-only **log** rules and do not enforce limits.

## Explicit STOP conditions

- Backup files are absent, zero-byte, not encrypted, or not independently restorable (especially Auth and Storage files).
- Real TOTP access/recovery and authenticated negative tests not demonstrated.
- Browser login, customer checkout, newsletter, design upload or admin actions fail on Preview; Turnstile `hostname` / `action` mismatch.
- Missing production environment secrets, unapproved repository commit, failing security CI, unknown rate limit impact, SQL migration mismatch, or unresolved release gate.
- Unknown branch protection. A red `Production security release readiness` workflow is an **intentional stop** until attestations exist.

Do not mark controls verified or merge/deploy simply because a synthetic PostgreSQL test passed.

## Evidence

- `tools/production-cutover-pg-assertions.sql`: proves Phase A leaves legacy RPC calls working, Phase B revokes them, and service-only gateways survive.
- `tools/newsletter-gateway-contract-test.mjs`: ensures public response cannot reveal `already_subscribed`.
- `tools/reviews-blocked-pg-assertions.sql`: synthetic blocked-account, role and 5/day quota.
- `tools/customer-designs-quota-pg-assertions.sql`: synthetic Storage RLS account boundary and 50-object cap.
- `tools/site-content-path-policy-test.sql`: synthetic filename whitelist.
- `SECURITY-FREE-PLAN-BACKUP-RECOVERY.md`: real backup/restore requirements.
- `tools/security-release-readiness.mjs`: fails closed while production release proof is absent.
