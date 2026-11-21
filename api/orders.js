// Vercel Node.js Function — server-verified checkout.
// Secrets: SUPABASE_SECRET_KEY (preferred; legacy SUPABASE_SERVICE_ROLE_KEY supported) and TURNSTILE_SECRET_KEY.
// Never expose them in js/config.js or the browser. Deployment is fail-closed.
import { isIP } from 'node:net';
import { createSecurityResponder } from '../server/security-observability.js';

const getSupabaseUrl = () => String(process.env.SUPABASE_URL || '').replace(/[/]+$/, '');
const limit = 512 * 1024;
// Production and Preview MUST be pinned to separate, exact Supabase hosts.
// This prevents a future deployment configuration mistake from silently writing
// checkout data to a different Supabase project. No credentials in this map.
const PREVIEW_SUPABASE_HOST = 'dlwjkcqoclvlsyjmrjec.supabase.co';
const PRODUCTION_SUPABASE_HOST = 'rfkqxiwbicjsszjbdhzd.supabase.co';
const expectedSupabaseHost = () => ({
  preview: PREVIEW_SUPABASE_HOST,
  production: PRODUCTION_SUPABASE_HOST
})[process.env.VERCEL_ENV] || null;
const validSupabaseTarget = raw => {
  try {
    const u = new URL(raw);
    const expectedHost = expectedSupabaseHost();
    const validShape = u.protocol === 'https:' && !u.username && !u.password
      && !u.port && u.pathname === '/' && !u.search && !u.hash
      && u.hostname.endsWith('.supabase.co');
    // Local / CI test harnesses may omit VERCEL_ENV; deployed Vercel
    // environments never do. Known environments always fail closed.
    return validShape && (!process.env.VERCEL_ENV
      ? true
      : Boolean(expectedHost) && u.hostname === expectedHost);
  } catch { return false; }
};
const sameOrigin = req => {
  const host = String(req.headers.host || '').toLowerCase();
  const origin = String(req.headers.origin || '');
  if (!host || !origin) return false;
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' && u.host.toLowerCase() === host;
  } catch { return false; }
};
const clientIp = req => {
  // Vercel overwrites this header with a trusted value at its edge.
  // Do not trust user supplied x-forwarded-for on other hosting providers.
  const ip = String(req.headers['x-vercel-forwarded-for'] || '')
    .split(',')[0].trim();
  return isIP(ip) ? ip : null;
};
async function verifyCaptcha(token,ip,hostname,secret) {
  const form = new URLSearchParams({secret,response:token,remoteip:ip});
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:form,signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) return false;
  const result = await response.json();
  // Cloudflare tokens are one-use and expire; action and host prevent
  // accepting a token issued for a different page or purpose.
  return result.success === true
    && result.action === 'order_checkout'
    && result.hostname?.toLowerCase() === hostname.toLowerCase();
}
async function verifiedUserId(authHeader,serviceKey,supabaseUrl) {
  if (!authHeader) return null;
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authHeader)) return false;
  const token = authHeader.slice(7);
  const r = await fetch(supabaseUrl+'/auth/v1/user',{
    headers:{apikey:serviceKey,Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(8000)
  });
  if (!r.ok) return false;
  const u = await r.json();
  return typeof u.id === 'string' && /^[0-9a-f-]{36}$/i.test(u.id) ? u.id : false;
}
export default async function handler(req,res) {
  const respond = createSecurityResponder(res, 'checkout');
  const fail = (status, code) => respond(status, {error: code});
  if (req.method !== 'POST') {
    res.setHeader('Allow','POST');
    return fail(405,'METHOD_NOT_ALLOWED');
  }
  // Reject cross-origin browser submissions and requests missing Origin.
  if (!sameOrigin(req)) return fail(403,'ORIGIN_REJECTED');
  if (!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) {
    return fail(415,'UNSUPPORTED_MEDIA_TYPE');
  }
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const captchaSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!serviceKey || !captchaSecret || !supabaseUrl) return fail(503,'CHECKOUT_NOT_CONFIGURED');
  // Reject malformed or unapproved Supabase origins before sending a secret.
  // This branch has only one approved Preview database.
  if (!validSupabaseTarget(supabaseUrl)) {
    return fail(503,'PREVIEW_DATABASE_NOT_ISOLATED');
  }

  const reportedLength = Number(req.headers['content-length']||0);
  if (reportedLength > limit) return fail(413,'ORDER_TOO_LARGE');
  const ip = clientIp(req);
  if (!ip) return fail(503,'NETWORK_VERIFICATION_UNAVAILABLE');

  let body;
  try {
    if (typeof req.body === 'string') body = JSON.parse(req.body);
    else body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
    if (Buffer.byteLength(JSON.stringify(body),'utf8')>limit) return fail(413,'ORDER_TOO_LARGE');
  } catch {return fail(400,'INVALID_ORDER');}

  const token = body.captchaToken;
  if (typeof token !== 'string' || token.length<10 || token.length>4096) {
    return fail(400,'CAPTCHA_REQUIRED');
  }
  const items = body.items;
  if (!Array.isArray(items)||!items.length||items.length>50) return fail(400,'INVALID_ORDER_ITEMS');
  // Cheap input checks BEFORE any network call: the database repeats all
  // sensitive business validation; these checks only reduce abuse cost.
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || !Number.isSafeInteger(item.productId) || item.productId <= 0
      || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 100
      || (item.customization != null
        && (typeof item.customization !== 'object' || Array.isArray(item.customization)))) {
      return fail(400,'INVALID_ORDER_ITEMS');
    }
  }
  if (!['pickup','ganja','region'].includes(body.delivery || 'pickup')) {
    return fail(400,'INVALID_ORDER');
  }
  if (body.delivery !== 'pickup' && body.delivery != null
    && body.addressUnknown !== true && !String(body.address || '').trim()) {
    return fail(400,'INVALID_ORDER');
  }
  const customer = body.customer;
  if (!customer || typeof customer !== 'object'||Array.isArray(customer)) return fail(400,'INVALID_ORDER');
  const name = String(customer.name||'').trim();
  const phone = String(customer.phone||'').trim();
  const phoneDigits = phone.replace(/[^0-9]/g,'');
  if (name.length<2||name.length>120||phone.length>40
      || phoneDigits.length<9||phoneDigits.length>15) return fail(400,'INVALID_ORDER');
  const authHeader = req.headers.authorization || '';
  try {
    const userId = await verifiedUserId(authHeader,serviceKey,supabaseUrl);
    if (userId===false) return fail(401,'AUTH_INVALID');
    const ok = await verifyCaptcha(token,ip,String(req.headers.host).split(':')[0],captchaSecret);
    if (!ok) return fail(403,'CAPTCHA_FAILED');

    const rpc = await fetch(supabaseUrl+'/rest/v1/rpc/create_order_gateway',{
      method:'POST',
      // New sb_secret_* keys identify the trusted backend via apikey only;
      // sending them as Bearer tokens breaks PostgREST JWT verification.
      headers:{apikey:serviceKey,'Content-Type':'application/json'},
      body:JSON.stringify({
        p_items:items,
        p_customer_name:name,
        p_customer_phone:phone,
        p_customer_email:String(customer.email||'').trim().slice(0,320),
        p_delivery:String(body.delivery||'pickup'),
        p_address:String(body.address||'').slice(0,500),
        p_address_unknown:body.addressUnknown===true,
        p_gift_wrap:body.giftWrap===true,
        p_verified_user_id:userId||null,
        p_verified_ip:ip
      }),
      signal:AbortSignal.timeout(12000)
    });
    if (!rpc.ok) {
      const err = await rpc.json().catch(()=>({}));
      // Only expose a narrow allowlist of business validation errors.
      const safe = new Set(['INVALID_ORDER','ADDRESS_REQUIRED','PRODUCT_NOT_FOUND',
        'OUT_OF_STOCK','ORDER_RATE_LIMITED','ACCOUNT_BLOCKED',
        'INVALID_DESIGN_PATH','DESIGN_FILE_NOT_FOUND','DESIGN_SCAN_REQUIRED',
        'DESIGN_SCAN_REJECTED','DESIGN_SCAN_UNAVAILABLE']);
      const code = String(err.message||'');
      return fail(code==='ORDER_RATE_LIMITED'?429:400,
        safe.has(code)?code:'ORDER_REJECTED');
    }
    const result = await rpc.json();
    const order = result?.order;
    if (!order || !order.order_code || typeof order.total==='undefined') {
      return fail(502,'ORDER_RESPONSE_INVALID');
    }
    return respond(200,{order:{orderCode:order.order_code,status:order.status,
      total_cents:Math.round(Number(order.total)*100)}});
  } catch {
    return fail(503,'CHECKOUT_TEMPORARILY_UNAVAILABLE');
  }
}
