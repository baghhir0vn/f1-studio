// F1 Studio newsletter abuse gateway. Preview first; production never auto-released.
// The public subscribe_newsletter RPC is revoked by the paired SQL migration.
import { isIP } from 'node:net';
import { createSecurityResponder } from '../server/security-observability.js';

const PREVIEW_HOST='dlwjkcqoclvlsyjmrjec.supabase.co';
const PRODUCTION_HOST='rfkqxiwbicjsszjbdhzd.supabase.co';
const MAX_BYTES=4096;
const allowedDatabase = value => {
  try {
    const u=new URL(value);
    const host = {preview:PREVIEW_HOST,production:PRODUCTION_HOST}[process.env.VERCEL_ENV];
    return Boolean(host) && u.protocol==='https:' && u.hostname===host
      && !u.username && !u.password && !u.port && u.pathname==='/'
      && !u.search && !u.hash;
  } catch { return false; }
};
export default async function handler(req,res){
  const respond = createSecurityResponder(res, 'newsletter');
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return respond(405,{error:'METHOD_NOT_ALLOWED'});
  }
  const rawOrigin=String(req.headers.origin||'');
  let authorizedOrigin=false;
  try{
    const u=new URL(rawOrigin);
    authorizedOrigin=u.protocol==='https:' && u.host.toLowerCase()===String(req.headers.host||'').toLowerCase()
      && u.pathname==='/' && !u.search && !u.hash && !u.username && !u.password;
  }catch{}
  if(!authorizedOrigin)return respond(403,{error:'ORIGIN_REJECTED'});

  if(!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers['content-type']||'')))
    return respond(415,{error:'UNSUPPORTED_MEDIA_TYPE'});
  const reported=Number(req.headers['content-length']||0);
  if(!Number.isFinite(reported)||reported<0||reported>MAX_BYTES)
    return respond(413,{error:'SUBSCRIPTION_TOO_LARGE'});
  const url=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key || !allowedDatabase(url))return respond(503,{error:'NEWSLETTER_NOT_CONFIGURED'});
  const ip=String(req.headers['x-vercel-forwarded-for']||'').trim();
  if(!isIP(ip))return respond(503,{error:'NETWORK_VERIFICATION_UNAVAILABLE'});
  let body;
  try {
    body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)
      ||Buffer.byteLength(JSON.stringify(body),'utf8')>MAX_BYTES)throw Error();
  }catch{return respond(400,{error:'INVALID_NEWSLETTER_EMAIL'});}
  const email=String(body.email??'').trim().toLowerCase();
  if(email.length<5||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return respond(400,{error:'INVALID_NEWSLETTER_EMAIL'});
  // A honeypot cannot replace IP rate limits, but cheaply discards form bots.
  if(typeof body.website==='string' && body.website.trim())
    return respond(200,{ok:true,subscribed:true});

  try {
    const response=await fetch(url+'/rest/v1/rpc/subscribe_newsletter_gateway',{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:key},
      body:JSON.stringify({p_email:email,p_verified_ip:ip}),
      signal:AbortSignal.timeout(8000)
    });
    if(!response.ok){
      const payload=await response.json().catch(()=>({}));
      const reason=String(payload.message||'');
      if(reason==='NEWSLETTER_RATE_LIMITED')
        return respond(429,{error:'NEWSLETTER_RATE_LIMITED'});
      if(reason==='INVALID_NEWSLETTER_EMAIL')
        return respond(400,{error:'INVALID_NEWSLETTER_EMAIL'});
      return respond(503,{error:'NEWSLETTER_TEMPORARILY_UNAVAILABLE'});
    }
    const payload=await response.json();
    if(payload?.ok!==true)return respond(502,{error:'NEWSLETTER_RESPONSE_INVALID'});
    // Never reveal whether a visitor's email already exists in the subscriber table.
    return respond(200,{ok:true,subscribed:true});
  }catch {
    return respond(503,{error:'NEWSLETTER_TEMPORARILY_UNAVAILABLE'});
  }
}
