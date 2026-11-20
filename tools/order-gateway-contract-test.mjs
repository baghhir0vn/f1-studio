// Zero-network contract tests for the Vercel checkout gateway.
// These tests do not send an order to Supabase or call Cloudflare.
import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/orders.js';

const host='f1studio-preview.example.com';
const makeReq=(overrides={})=>({
  method:'POST',
  headers:{
    host,origin:'https://'+host,
    'content-type':'application/json',
    'x-vercel-forwarded-for':'203.0.113.17'
  },
  body:{
    captchaToken:'fake-testing-turnstile-token',
    items:[{productId:7,qty:1}],
    customer:{name:'Test Buyer',phone:'0501234567'},
    delivery:'pickup'
  },
  ...overrides
});
const makeRes=()=>{
  const res={statusCode:200,headers:{},body:null};
  res.setHeader=(k,v)=>{res.headers[k.toLowerCase()]=v;return res;};
  res.status=s=>{res.statusCode=s;return res;};
  res.json=o=>{res.body=o;return res;};
  return res;
};
const env=()=>{
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL='https://isolated-test.supabase.co';
  delete process.env.VERCEL_ENV;
  process.env.SUPABASE_SERVICE_ROLE_KEY='fake-testing-service-role-key';
  process.env.TURNSTILE_SECRET_KEY='fake-testing-captcha-secret';
};
const withFetch=async(fn,run)=>{
  const before=globalThis.fetch;
  globalThis.fetch=fn;
  try{return await run();}
  finally{globalThis.fetch=before;}
};
const reply=(body,ok=true)=>({ok,status:ok?200:400,json:async()=>body});
test('GET does not call any external service',async()=>{
  const res=makeRes();await handler(makeReq({method:'GET'}),res);
  assert.equal(res.statusCode,405);
  assert.equal(res.body.error,'METHOD_NOT_ALLOWED');
});
test('forged Origin rejected before any external service',async()=>{
  const res=makeRes();await handler(makeReq({headers:{...makeReq().headers,origin:'https://evil.example'}}),res);
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error,'ORIGIN_REJECTED');
});
test('missing CAPTCHA rejected without contacting Supabase',async()=>{
  env();const res=makeRes();
  await handler(makeReq({body:{...makeReq().body,captchaToken:''}}),res);
  assert.equal(res.statusCode,400);
  assert.equal(res.body.error,'CAPTCHA_REQUIRED');
});
test('fails closed when secrets are not installed',async()=>{
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  const res=makeRes();await handler(makeReq(),res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.error,'CHECKOUT_NOT_CONFIGURED');
});
test('wrong Turnstile hostname prevents DB calls',async()=>{
  env();const res=makeRes();const urls=[];
  await withFetch(async url=>{
    urls.push(String(url));return reply({success:true,action:'order_checkout',hostname:'other.example.com'});
  },()=>handler(makeReq(),res));
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error,'CAPTCHA_FAILED');
  assert.equal(urls.length,1);
  assert.match(urls[0],/siteverify/);
});
test('wrong Turnstile action prevents DB calls',async()=>{
  env();const res=makeRes();let calls=0;
  await withFetch(async()=>{calls++;return reply({success:true,action:'login',hostname:host});},
    ()=>handler(makeReq(),res));
  assert.equal(res.statusCode,403);assert.equal(calls,1);
});
test('valid guest order uses only gateway and filters result fields',async()=>{
  env();const res=makeRes();let rpcRequest;
  await withFetch(async(url,opts)=>{
    const address=String(url);
    if(address.includes('siteverify'))return reply({success:true,action:'order_checkout',hostname:host});
    if(address.includes('/rpc/create_order_gateway')){
      rpcRequest=JSON.parse(opts.body);
      return reply({order:{order_code:'F1-TEST',status:'pending_confirmation',
        total:15,customer_phone:'PRIVATE',customer_name:'PRIVATE'}});
    }
    throw Error('Unexpected HTTP request: '+address);
  },()=>handler(makeReq(),res));
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{order:{orderCode:'F1-TEST',status:'pending_confirmation',total_cents:1500}});
  assert.equal(rpcRequest.p_verified_user_id,null);
  assert.equal(rpcRequest.p_verified_ip,'203.0.113.17');
});
test('authenticated order validates JWT before writing',async()=>{
  env();const res=makeRes();const uid='123e4567-e89b-42d3-a456-426614174000';
  let rpcRequest;
  await withFetch(async(url,opts)=>{
    const address=String(url);
    if(address.includes('/auth/v1/user')) {
      assert.equal(opts.headers.Authorization,'Bearer fake.jwt.token');
      return reply({id:uid});
    }
    if(address.includes('siteverify'))return reply({success:true,action:'order_checkout',hostname:host});
    if(address.includes('/rpc/create_order_gateway')){
      rpcRequest=JSON.parse(opts.body);
      return reply({order:{order_code:'F1-AUTH',status:'pending_confirmation',total:19.75}});
    }
    throw Error('Unexpected HTTP request');
  },()=>handler(makeReq({headers:{...makeReq().headers,authorization:'Bearer fake.jwt.token'}}),res));
  assert.equal(res.statusCode,200);
  assert.equal(rpcRequest.p_verified_user_id,uid);
});
test('invalid JWT stops checkout before CAPTCHA or RPC',async()=>{
  env();const res=makeRes();let calls=0;
  await withFetch(async()=>{
    calls++;return reply({message:'JWT invalid'},false);
  },()=>handler(makeReq({headers:{...makeReq().headers,authorization:'Bearer invalid.token'}}),res));
  assert.equal(res.statusCode,401);
  assert.equal(calls,1);
});

test('preview rejects production Supabase database',async()=>{
  env();process.env.VERCEL_ENV='preview';
  process.env.SUPABASE_URL='https://rfkqxiwbicjsszjbdhzd.supabase.co';
  const res=makeRes();await handler(makeReq(),res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.error,'PREVIEW_DATABASE_NOT_ISOLATED');
  delete process.env.VERCEL_ENV;
});

test('new Supabase secret key is accepted by the server-only gateway',async()=>{
  env();
  process.env.SUPABASE_SECRET_KEY='sb_secret_synthetic_test_only';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res=makeRes();
  const requests=[];
  await withFetch(async(url,opts)=>{
    const target=String(url);
    requests.push({target,headers:opts?.headers||{}});
    if(target.includes('siteverify')){
      return reply({success:true,action:'order_checkout',hostname:host});
    }
    if(target.includes('/rpc/create_order_gateway')){
      return reply({order:{order_code:'F1-SECRET-TEST',status:'pending_confirmation',total:7.5}});
    }
    throw Error('Unexpected outgoing request');
  },()=>handler(makeReq(),res));
  assert.equal(res.statusCode,200);
  assert.equal(res.body.order.orderCode,'F1-SECRET-TEST');
  const rpc=requests.find(x=>x.target.includes('/rpc/create_order_gateway'));
  assert.ok(rpc,'RPC request must use isolated test service');
  assert.equal(rpc.headers.apikey,'sb_secret_synthetic_test_only');
  assert.equal('Authorization' in rpc.headers,false,'Never send sb_secret as an Authorization Bearer token');
  delete process.env.SUPABASE_SECRET_KEY;
});
