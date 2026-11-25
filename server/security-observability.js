// Privacy-minimal audit events shared by Vercel API endpoints.
// Never log raw request/response bodies, auth headers, tokens, personal data,
// IP addresses, URLs with query strings, third-party error objects or secrets.
import { randomUUID } from 'node:crypto';

const allowedScopes = new Set(['checkout', 'newsletter']);
const reportableCodes = new Set([
  'ORIGIN_REJECTED',
  'CAPTCHA_FAILED',
  'NETWORK_VERIFICATION_UNAVAILABLE',
  'AUTH_INVALID',
  'ORDER_RATE_LIMITED',
  'NEWSLETTER_RATE_LIMITED',
  'CHECKOUT_NOT_CONFIGURED',
  'PREVIEW_DATABASE_NOT_ISOLATED',
  'NEWSLETTER_NOT_CONFIGURED',
  'CHECKOUT_TEMPORARILY_UNAVAILABLE',
  'NEWSLETTER_TEMPORARILY_UNAVAILABLE',
  'ORDER_RESPONSE_INVALID',
  'NEWSLETTER_RESPONSE_INVALID',
  'ORDER_REJECTED'
]);

// A 403 is sampled to reduce log-bombing during attacks. All 429 and 5xx
// events are included. Use Vercel Firewall's aggregated request metrics
// alongside this best-effort application telemetry.
function shouldReport(status, requestId) {
  if (status === 429 || status >= 500) return true;
  if (status === 403 || status === 401) return parseInt(requestId.slice(-2), 16) % 16 === 0;
  return false;
}

export function createSecurityResponder(res, scope) {
  if (!allowedScopes.has(scope)) throw new Error('UNSUPPORTED_AUDIT_SCOPE');
  // Never accept request-provided X-Request-ID: an attacker could inject
  // arbitrary text into logs and confuse audit correlation.
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);
  return function respond(status, body) {
    if (shouldReport(status, requestId)) {
      const code = typeof body?.error === 'string' && reportableCodes.has(body.error)
        ? body.error
        : 'UNCLASSIFIED';
      // Fixed keys and validated enum values ONLY.
      console.warn('F1_SECURITY_EVENT', JSON.stringify({
        schema: 1,
        scope,
        status,
        code,
        requestId
      }));
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(status).json(body);
  };
}
