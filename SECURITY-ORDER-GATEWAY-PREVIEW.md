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

## Actual isolated Supabase validation — 2026-11-20

- Free project `F1 Studio Security Test` (`dlwjkcqoclvlsyjmrjec`) was created at quoted $0/month in `F1studio`. Its database is separate from production (`rfkqxiwbicjsszjbdhzd`).
- The test project has a minimal checkout/catalog schema, test product records, and no copied customer data.
- Applied the original production `create_order()` to the test project, then the gateway restriction migration. Initial guest checkout found two existing PL/pgSQL ambiguities (`ON CONFLICT (rate_key)` and `item` alias). Applied a corrected source **to the TEST database only**; the correction is staged separately in `security-create-order-ambiguity-fix.sql`.
- Test checkout scenarios under a transaction with rollback: guest order, authoritative price despite fake frontend price, disabled product, invalid quantity, per-IP rate limit 8 in 10 minutes; passed. PostgreSQL code and privilege contract tests passed in GitHub CI.
- After rollback: **0 test orders, 0 test order items, 0 rate-limit entries**, three test products.
- Branch Preview `js/config.js`, HTML CSP, `vercel.json` CSP and asset URL checks now use only the test Supabase URL. The production branch was not changed.
- A branch-scoped Vercel Preview `SUPABASE_URL` points to the separate test project. **Do not put a production Supabase service-role key into this Preview.**
- Outstanding: configure matching **test** `SUPABASE_SERVICE_ROLE_KEY` and `TURNSTILE_SECRET_KEY` as encrypted/sensitive Preview environment variables, register or verify Preview hostname with the Cloudflare widget, then test full browser-to-server-to-Supabase checkout with that isolated project.
- Full application may show missing ancillary tables such as reviews/newsletter until the test schema is expanded; the isolation is intentionally focused on order checkout first.

## Production release safety

**Do not merge this branch directly to main.** The branch's static client configuration and CSP deliberately point to the test database. A production release must restore the production Supabase publishable URL and CSP, install production server-only secrets, apply the staged SQL migrations with an atomic cutover and verify that direct anonymous RPC is denied. Merely merging the preview branch would redirect the public site to the wrong database.

## Preview status and remaining human-only setup

The Vercel security Preview now uses the **real Cloudflare sitekey**
`0x4AAAAAAGKpifK9AkrYwRjU` supplied by the widget owner on 2026-11-20.
The Preview Turnstile secret is configured as branch-scoped Vercel
`TURNSTILE_SECRET_KEY` (sensitive) and the isolated Supabase test
secret as `SUPABASE_SECRET_KEY` (sensitive). These are not in source code.
Cloudflare widget hostname must match the actual URL visited;
prefer the registered stable branch alias for end-to-end browser tests.
Token verification still requires both action `order_checkout` and exact
hostname; a different Vercel deployment hostname is rejected intentionally.

No Cloudflare account connector is available. The Supabase connector exposes
public/publishable keys, but not the secret key. Do not request or paste
secret keys into chat, source code or git comments.

To validate end-to-end checkout safely:
1. In Supabase test project `dlwjkcqoclvlsyjmrjec`, go to Project
   Settings → API Keys → Secret keys and create/copy the key into your own
   secure environment.
2. In Vercel project `f1_studio`, Settings → Environment Variables, set
   branch-scoped Preview `SUPABASE_SECRET_KEY` (type: sensitive/encrypted);
   **not** production and never the production Supabase secret.
3. Create a Cloudflare Turnstile widget for the exact Preview hostname,
   use its real sitekey and secret. (Completed for this Preview branch.)
4. Set branch-scoped Preview `TURNSTILE_SECRET_KEY` in Vercel (encrypted).
5. Redeploy this branch and run guest/authenticated checkout with
   synthetic data. Never send test orders to a real WhatsApp number.
6. During promotion restore the production public config and only install
   production-specific secrets in the production environment.

`SUPABASE_SECRET_KEY` is preferred; legacy `SUPABASE_SERVICE_ROLE_KEY`
remains supported in the API server. Only the backend API reads this key.
