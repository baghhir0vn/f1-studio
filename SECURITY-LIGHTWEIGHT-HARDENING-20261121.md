# F1 Studio — lightweight hardening, 2026-11-21

**Scope:** Preview-only WAF change; staged SQL and antivirus worker files. NO production deploy or production Supabase writes. Real backups and a separately verified restore remain mandatory.

## 1. Preview WAF (ACTIVATED, tested)

Vercel firewall configuration v3 has a new enabled `deny` rule **F1 Security Preview — deny common exploit probes**. Every request must match BOTH `environment=preview` and the exact branch's Preview hostname, plus an unmistakably irrelevant sensitive path beginning with `/.env`, `/.git`, `/wp-login.php`, `/wp-admin` or `/vendor/phpunit`. No production host is included. The two existing `POST /api/orders` and `POST /api/newsletter` log-only rules are unchanged.

Read-only smoke responses from the stable Preview hostname:
- `GET /`: 200
- `GET /.git/config`: 403 (blocked)
- `GET /api/orders`: 405 (expected POST-only response)

The WAF's broader SQLi/XSS/RCE managed protections remain in `log` mode. Do not claim they block; evaluate provider traffic/false positives before any change. No paid global rate limiter was enabled.

## 2. Least-privilege orders (STAGED, not production)

Production read-only permission inspection found authenticated users technically have table-wide UPDATE on `public.orders`. RLS still guards operations using `is_admin()`, but column-level access can reduce impact from a future RLS defect. The reviewed frontend directly updates only `status` via `js/services/order-service.js`.

`security-orders-status-only-preview.sql` revokes table-wide authenticated UPDATE and grants only `UPDATE(status)` to authenticated, without touching the existing RLS or service-role functions. `tools/orders-status-only-pg-assertions.sql` exercises allowed status update and denied phone-number update in disposable PostgreSQL, then cleans up synthetic records. It has NOT been applied to production or the incomplete TEST Supabase project; do not modify database privileges without an independent restorable backup and real admin regression test.

## 3. Antivirus worker (STAGED CORE, not installed or integrated)

`server/antivirus/clamd-instream.mjs` implements bounded ClamAV INSTREAM scanning over a private local UNIX socket (10 MiB cap, deadline, fail-closed malformed/offline/timeout behavior). `server/antivirus/quarantine-gate.mjs` stages a worker-only scan and safe-byte publication control with SHA-256. `tools/antivirus-worker-test.mjs` tests fake local clamd replies: clean, infected, missing daemon, bad protocol, oversized payload, exact scanned-byte publication, and failure/no-publish.

**Critical:** The code is NOT called by the browser or actual upload endpoints. There is no running ClamAV process or safe quarantine/scan ledger yet. Customer designs, avatars, product and site-content uploads still need a complete isolated quarantine → worker scan → trusted promotion → non-bypassable final Storage RLS workflow and real EICAR validation. The release manifest's `malware-scan-storage-gate` remains `verified:false`. Scanner unavailable MUST block promotion, never silently allow.

Actual `clamd` requires separate worker infrastructure, current virus signatures, bounded resources, and private key/socket access. This is deliberately not added to Vercel page handlers to avoid increasing page latency.

## Verification and release boundaries

- Latest security CI on commit `7475225f9e8c911a747d98f20c76b27f79ffebb2`, run `44870270214`: contract and PostgreSQL jobs both passed.
- GitHub release-readiness workflow is intentionally red due to unverified full backup/restore, MFA, AV end-to-end and other release controls. Do not bypass the gate.
- Production deployment and its database remain unchanged. Never mark a synthetic scanner or synthetic pg_dump test as real production evidence.
