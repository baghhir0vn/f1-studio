// Regression guard: this branch must never use the production database
// or send a synthetic test order to a real WhatsApp recipient.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const productionHost='rfkqxiwbicjsszjbdhzd.supabase.co';
const testHost='dlwjkcqoclvlsyjmrjec.supabase.co';
test('all static client configuration and CSP use test Supabase only',()=>{
 for(const path of ['js/config.js','config.js','index.html','vercel.json',
                   'js/services/product-service.js','js/admin-orders.js']){
   const text=read(path);
   assert.equal(text.includes(productionHost),false,path+' contains production host');
 }
 const config=read('js/config.js');
 assert.equal(config.includes(testHost),true);
 assert.match(config,/securityPreview:\s*true/);
 assert.match(config,/turnstileSiteKey:\s*"0x4AAAAAAGKpifK9AkrYwRjU"/);
 assert.match(read('index.html'),/<meta name="robots" content="noindex,nofollow">/);
});
test('synthetic preview checkout does not attempt WhatsApp message',()=>{
 const cart=read('js/cart.js');
 assert.match(cart,/const popup=CONFIG\.securityPreview\s*\?/);
 assert.match(cart,/if\(!CONFIG\.securityPreview\)\{/);
 assert.match(cart,/WhatsApp-a göndərilmədi/);
});
test('test branch does not accidentally include a production secret',()=>{
 const paths=['js/config.js','config.js','index.html','vercel.json',
             'js/cart.js','js/services/order-service.js'];
 for(const p of paths){
   const t=read(p);
   assert.equal(t.includes('sb_secret_'),false,p+' references a server-side secret');
   assert.equal(t.includes('SUPABASE_SERVICE_ROLE_KEY'),false,p+' contains server secret env');
 }
});

test('security Preview catalog loads products through restricted Supabase RLS',()=>{
 const catalog=read('js/catalog.js');
 const service=read('js/services/product-service.js');
 assert.match(catalog,/import\s*\{\s*productService\s*\}\s*from\s*['"]\.\/services\/product-service\.js['"]/);
 assert.match(catalog,/await\s+productService\.list\(\)/);
 assert.doesNotMatch(catalog,/ctx\.api\(['"]\/api\/products['"]\)/);
 assert.match(catalog,/CONFIG\.securityPreview\s*\|\|\s*sources\.some\(/);
 assert.match(service,/sb\.from\(['"]products['"]\)\.select\(PRODUCT_COLUMNS\)/);
});
