// Vercel Node.js Function — server-verified checkout.
// Secrets: SUPABASE_SERVICE_ROLE_KEY and TURNSTILE_SECRET_KEY.
// Never expose them in js/config.js or the browser. Deployment is fail-closed.
import { isIP } from 'node:net';

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/[/]+$/, '');
const limit = 512 * 1024;
const json = (res,status,body) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(body);
};
const fail = (res,status,code) => json(res,status,{error:code});

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
async function verifiedUserId(authHeader,serviceKey) {
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
  if (req.method !== 'POST') {
    res.setHeader('Allow','POST');
    return fail(res,405,'METHOD_NOT_ALLOWED');
  }
  // Reject cross-origin browser submissions and requests missing Origin.
  if (!sameOrigin(req)) return fail(res,403,'ORIGIN_REJECTED');
  if (!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) {
    return fail(res,415,'UNSUPPORTED_MEDIA_TYPE');
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const captchaSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!serviceKey || !captchaSecret || !supabaseUrl) return fail(res,503,'CHECKOUT_NOT_CONFIGURED');
  // A Preview with production Supabase credentials is unsafe: fail closed.
  if (process.env.VERCEL_ENV === 'preview' &&
      new URL(supabaseUrl).hostname === 'rfkqxiwbicjsszjbdhzd.supabase.co') {
    return fail(res,503,'PREVIEW_DATABASE_NOT_ISOLATED');
  }

  const reportedLength = Number(req.headers['content-length']||0);
  if (reportedLength > limit) return fail(res,413,'ORDER_TOO_LARGE');
  const ip = clientIp(req);
  if (!ip) return fail(res,503,'NETWORK_VERIFICATION_UNAVAILABLE');

  let body;
  try {
    if (typeof req.body === 'string') body = JSON.parse(req.body);
    else body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
    if (Buffer.byteLength(JSON.stringify(body),'utf8')>limit) return fail(res,413,'ORDER_TOO_LARGE');
  } catch {return fail(res,400,'INVALID_ORDER');}

  const token = body.captchaToken;
  if (typeof token !== 'string' || token.length<10 || token.length>4096) {
    return fail(res,400,'CAPTCHA_REQUIRED');
  }
  const items = body.items;
  if (!Array.isArray(items)||!items.length||items.length>50) return fail(res,400,'INVALID_ORDER_ITEMS');
  const customer = body.customer;
  if (!customer || typeof customer !== 'object'||Array.isArray(customer)) return fail(res,400,'INVALID_ORDER');
  const name = String(customer.name||'').trim();
  const phone = String(customer.phone||'').trim();
  if (name.length<2||name.length>120||phone.length>40) return fail(res,400,'INVALID_ORDER');
  const authHeader = req.headers.authorization || '';
  try {
    const userId = await verifiedUserId(authHeader,serviceKey);
    if (userId===false) return fail(res,401,'AUTH_INVALID');
    const ok = await verifyCaptcha(token,ip,String(req.headers.host).split(':')[0],captchaSecret);
    if (!ok) return fail(res,403,'CAPTCHA_FAILED');

    const rpc = await fetch(supabaseUrl+'/rest/v1/rpc/create_order_gateway',{
      method:'POST',
      headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},
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
        'INVALID_DESIGN_PATH','DESIGN_FILE_NOT_FOUND']);
      const code = String(err.message||'');
      return fail(res,code==='ORDER_RATE_LIMITED'?429:400,
        safe.has(code)?code:'ORDER_REJECTED');
    }
    const result = await rpc.json();
    const order = result?.order;
    if (!order || !order.order_code || typeof order.total==='undefined') {
      return fail(res,502,'ORDER_RESPONSE_INVALID');
    }
    return json(res,200,{order:{orderCode:order.order_code,status:order.status,
      total_cents:Math.round(Number(order.total)*100)}});
  } catch {
    return fail(res,503,'CHECKOUT_TEMPORARILY_UNAVAILABLE');
  }
}
