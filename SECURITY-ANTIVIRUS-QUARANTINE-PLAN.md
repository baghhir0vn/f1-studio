# F1 Studio — anti-malware upload gate (DESIGN ONLY; NOT ACTIVE)

**Status 2026-11-21:** No actual file antivirus runs in production OR security Preview. This document must never be misrepresented as a deployed scanner. The `malware-scan-storage-gate` release control is explicitly UNVERIFIED.

## Confirmed existing flow and threat

- `js/services/storage-service.js` currently uploads customer designs directly to the private `customer-designs` bucket after browser-only magic-byte/size checks. User/admin roles can obtain reads or signed URLs from final bucket. Therefore client-side scanning is bypassable, and a scan after direct final upload would leave an exposure window.
- Other upload surfaces: customer avatars (client creates WebP then uploads to private `customer-avatars`), admin product images (public `product-images`), and admin site content (public `site-content`). All must be covered; do not protect only PDFs.
- Existing Storage RLS protects bucket ownership but does NOT imply malware scanning. A downloaded PDF or crafted image may still be malicious.
- Existing files must be scanned or explicitly marked legacy/unknown. Do not auto-mark `clean`.

## Required trust boundaries

1. Browser uploads **only to a new PRIVATE unscanned/quarantine bucket**, via owner-scoped RLS or short-lived one-object upload grant. Keep object paths strongly validated and sizes/MIME constrained. Quarantine must deny browser SELECT, public URLs, object listing, and signed URL creation. Limit unscanned backlog and expiration.
2. A trusted **independently hosted** scanner worker downloads quarantine object bytes via a server-side credential. Use an isolated ClamAV process with regularly updated signatures; run it with minimal privileges, egress policy, CPU/RAM/time limits and a strict 10 MB file cap. A private/self-managed scanner protects customers' photos and designs; do **not** upload them to public VirusTotal. Dedicated hosted scanning providers would need separate privacy, retention and cost review.
3. The scanner checks actual bytes and content type, scans for malware, computes SHA-256, and ties verdict to that exact immutable object version/digest. Only `clean` may be promoted by a trusted service-only worker to the destination private/public bucket. The scanner must upload the **exact scanned bytes**, not read a potentially swapped source afterward (TOCTOU).
4. Use a service-only database record `pending/scanning/clean/infected/failed`, with unique `bucket/path/digest` (and safe retry/idempotency semantics). The client must not be able to write verdicts. Database/RLS and final Storage write grants must prohibit **every** unscanned direct final upload, including manual REST and SDK bypass. Scan failures, signature update failure, timeout, worker outages and malformed responses must **fail closed** (no promotion).
5. On `infected`, never serve/download/send to admin/WhatsApp. Quarantine or delete using defined incident/retention policy, save minimal event metadata and sanitized request ID; no sample bytes or personal filenames in logs. `failed` stays inaccessible; allow bounded retry.
6. Final application and order validation use only promoted `clean` final bucket paths. `downloadCustomerDesign`, `createCustomerDesignSignedUrl`, admin order download and product/site image URLs must never grant unscanned source access. Existing production objects need migration/backfill or a carefully documented legacy treatment.
7. To preserve 10 MB customer design uploads, avoid passing file *request bodies* through a small Vercel function. Upload directly to quarantine with Supabase Storage; a bounded backend job coordinates scanning and promotion using service-only credentials. The exact service plan and infrastructure must be verified before coding live integration.
8. Provide the user with a clear UI state: `Yüklənir` → `Antivirus yoxlayır` → `Hazırdır`, or `Fayl qəbul edilmədi`. Do not create orders referring to an unscanned file.

## Minimum end-to-end tests required before enabling production

- Safe PNG/JPEG/WebP/PDF: real ClamAV scan and promotion, restored file digest matches.
- **EICAR** standard *synthetic* antivirus test pattern placed in a test file: ClamAV must flag and block, no promotion/signed URL/order path. Never use live malware.
- Invalid content/MIME, disguised executable, oversized payload, corrupt image, zip bomb, unexpected path: reject without public exposure.
- ClamAV unavailable / signatures too old / scan timeout / network failure: fail closed, preserve quarantine privacy.
- Spoofed client `clean` claim, anonymous direct upload to final bucket, authenticated direct upload, forged owner ID, cross-account scan request, object replacement after scan: all rejected.
- Authenticated customer and admin can still upload/use/download legitimate files; product images are not publicly readable until scanned and promoted.
- No customer content, original filenames, IPs, JWT, AV token or Storage service key in public APIs, responses, log exports or source control.
- Verify existing saved design files remain accessible ONLY under explicitly reviewed legacy migration rules.

## Remaining dependencies

- Actual scanner compute/network environment is **not provisioned**. Needs a secure isolated ClamAV worker (e.g., a container service) with signature database updates, secrets, private network/TLS and paid/free tier decision.
- The quarantine bucket, RLS, scan jobs, scanner worker and final promotion API have **not** been provisioned or deployed; adding half of these alone would break live customer uploads.
- Only after a full isolated/production-equivalent E2E run, scanner monitoring, backup/restore and explicit approval can `malware-scan-storage-gate` be marked `verified:true`. The production release must remain blocked.
