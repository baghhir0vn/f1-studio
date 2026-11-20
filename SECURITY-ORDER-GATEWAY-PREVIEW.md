# F1 Studio — Preview-only server-protected orders

**Not deployed to production. Do not apply SQL migration until this Vercel API
route and its secrets are configured and a separate Supabase test database is ready.**

## Intended protections

- POST /api/orders goes through Vercel Function (not browser Supabase RPC).
- Requires same-origin, JSON content, trusted Vercel-proxy client IP,
  a fresh action-bound Cloudflare Turnstile token, and optionally validates
  an authenticated user's JWT server-side.
- Calls a separate `service_role`-only Supabase function.
- Revokes anonymous/authenticated EXECUTE on the original create_order RPC.
- Existing business validations and rate limiting remain in create_order.
- Does NOT change the stock rules. PR #22's stock patch is separate.
- No CAPTCHA bypass fallback. Errors are fail-closed.

## Manual environment setup (secrets must not be committed)

In Vercel Project Settings -> Environment Variables, configure
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `TURNSTILE_SECRET_KEY` for Preview
using **a separate Supabase development branch (with its own URL and role key) and Cloudflare Turnstile test
or development widget**. Preview API intentionally rejects the production F1 Studio Supabase URL. Set production versions only at the separate,
approved production cutover. Avoid using production credentials in preview.

Cloudflare Turnstile widget must allow the preview hostname; Siteverify
must confirm action `order_checkout` and that exact hostname.

Important: Vercel Preview still uses the current production Supabase
publishable URL for other application screens. Do not submit real orders
through it until isolated services are configured.

## Validation before release

1. Apply the gateway SQL in a disposable Supabase test project/branch.
2. Verify `anon` / `authenticated` CANNOT execute either gateway or original RPC.
3. Verify `service_role` CAN execute the gateway, and owner identity is preserved.
4. CAPTCHA missing, invalid, expired, reused, wrong action/hostname -> reject.
5. Browser cross-origin request -> reject; no JWT when guest -> accepted after CAPTCHA.
6. Invalid JWT -> reject; blocked user -> reject.
7. Multiple fast orders -> database 429; invalid order does not alter orders.
8. Order results expose only code, status, and total. No internal PII.
9. Verify mobile checkout, WhatsApp popup and account order history.
10. Confirm trusted client IP header behaviour on the actual Vercel runtime.

## Production cutover: atomicity warning

Deploy code + secrets and SQL as a coordinated release. Applying the
REVOKE before deploying the Function will break checkout. Releasing the
Function before migration will also make it fail until the gateway exists.

The feature remains preview-only until the above tests pass.
