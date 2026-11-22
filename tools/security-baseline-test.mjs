// Security regression checks for browser-delivered files and deployment headers.
// Completely offline. Never echo matched secret values into CI logs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, dirname } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = name => readFileSync(join(root,name),'utf8');
const files = [];
function visit(folder) {
  for (const entry of readdirSync(join(root,folder),{withFileTypes:true})) {
    const rel = join(folder,entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'vendor') visit(rel);
    } else if (entry.isFile() && /\.(?:js|mjs|json|html|css)$/.test(entry.name)) {
      files.push(rel);
    }
  }
}
for(const p of ['index.html','config.js','vercel.json']) files.push(p);
visit('js');

const secretChecks = [
  ['Supabase server secret', /sb_secret_[A-Za-z0-9_-]{8,}/],
  ['service role key name', /\bSUPABASE_SERVICE_ROLE_KEY\b/],
  ['server-side Supabase secret env', /\bSUPABASE_SECRET_KEY\b/],
  ['Cloudflare Turnstile secret env', /\bTURNSTILE_SECRET_KEY\b/],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['private API key', /\b(?:OPENAI_API_KEY|VERCEL_TOKEN|CLOUDFLARE_API_TOKEN)\b/]
];

test('browser assets do not expose backend credentials or secret environment variables', () => {
  for(const file of files){
    const source = read(file);
    for(const [label,pattern] of secretChecks){
      assert.equal(pattern.test(source),false,file+': '+label+' must not appear in a browser-delivered asset');
    }
  }
});

test('security Preview never references the production database from browser files', () => {
  const productionHost = 'rfkqxiwbicjsszjbdhzd.supabase.co';
  for(const file of files){
    assert.equal(read(file).includes(productionHost),false,file+': production DB origin is forbidden in Preview');
  }
});

test('Vercel security response headers remain enabled and strict', () => {
  const config = JSON.parse(read('vercel.json'));
  const globalRule = config.headers?.find(rule=>rule.source === '/(.*)');
  assert.ok(globalRule,'Global security headers missing');
  const headers = Object.fromEntries(globalRule.headers.map(h=>[h.key.toLowerCase(),h.value]));
  assert.match(headers['strict-transport-security'],/max-age=\d+/);
  assert.equal(headers['x-content-type-options'],'nosniff');
  assert.equal(headers['x-frame-options'],'DENY');
  assert.ok(headers['referrer-policy']);
  assert.match(headers['permissions-policy'],/camera=\(\)/);
  const csp = headers['content-security-policy'];
  assert.ok(csp,'Global CSP is required');
  for(const directive of ["object-src 'none'","base-uri 'self'","frame-ancestors 'none'","form-action 'self'"]){
    assert.ok(csp.includes(directive),'Missing CSP: '+directive);
  }
  const scriptSrc = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1] || '';
  assert.ok(scriptSrc,'script-src directive required');
  assert.ok(!scriptSrc.includes("'unsafe-inline'")&&!scriptSrc.includes("'unsafe-eval'"),
    'JavaScript execution policy has been weakened');
});

test('HTML does not replace the strict header CSP with a weaker meta policy', () => {
  const html=read('index.html');
  const m=html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(m,'Preview HTML CSP meta missing');
  const metaCsp=m[1];
  const scriptSrc=metaCsp.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1]||'';
  assert.ok(scriptSrc && !scriptSrc.includes("'unsafe-eval'")&&!scriptSrc.includes("'unsafe-inline'"));
  assert.match(html,/<meta\s+name="robots"\s+content="noindex,nofollow"/i);
});

test('server-side checkout guards stay in server files, not in public scripts',()=>{
  assert.match(read('js/config.js'),/adminMfaEnabled:\s*true/);
  assert.match(read('js/config.js'),/securityPreview:\s*true/);
  const gateway=read('api/orders.js');
  assert.match(gateway,/PREVIEW_SUPABASE_HOST/);
  assert.match(gateway,/verifyCaptcha\(/);
  assert.match(gateway,/create_order_gateway/);
});
