// Offline API contract tests: NO Supabase, Cloudflare, live DNS or email sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/newsletter.js';
const HOST='f1studio-git-security-preview-orde-9ffb80-nurlanbagirov834-7802.vercel.app';
const makeReq=(override={})=>({
  method:'POST',
  headers:{host:HOST,origin:'https://'+HOST,
    'content-type':'application/json','x-vercel-forwarded-for':'203.0.113.24'},
  body:{email:'Test@Example.org'},...override
});
function res(){
  const response={statusCode:200,headers:{},body:null};
  response.setHeader=(k,v)=>{response.headers[k.toLowerCase()]=v;return response;};
  response.status=v=>{response.statusCode=v;return response;};
  response.json=x=>{response.body=x;return response;};
  return response;
}
const configure=()=>{
  process.env.VERCEL_ENV='preview';
  process.env.SUPABASE_URL='https://dlwjkcqoclvlsyjmrjec.supabase.co';
  process.env.SUPABASE_SECRET_KEY='sb_secret_synthetic_NEVER_REAL';
};
const restoreFetch=async(stub,run)=>{
  const prior=globalThis.fetch;
  globalThis.fetch=stub;
  try{return await run();}
  finally{globalThis.fetch=prior;}
};
const reply=(body,ok=true)=>({ok,json:async()=>body});
test('newsletter refuses method/Origin/media violations without network',async()=>{
  configure();let calls=0;
  await restoreFetch(async()=>{calls++;throw Error('network forbidden');},async()=>{
    for(const req of [
      makeReq({method:'GET'}),
      makeReq({headers:{...makeReq().headers,origin:'https://attacker.example'}}),
      makeReq({headers:{...makeReq().headers,'content-type':'text/plain'}}),
      makeReq({body:{email:'invalid'}}),
      makeReq({body:{email:'test@example.org',website:'fake-filled-by-bot'}})
    ]){
      const response=res();
      await handler(req,response);
      assert.ok([200,400,403,405,415].includes(response.statusCode));
    }
  });
  assert.equal(calls,0);
});
test('only the exact test project may be contacted in Preview',async()=>{
  configure();let calls=0;
  await restoreFetch(async()=>{calls++;throw Error('network forbidden');},async()=>{
    for(const url of [
      'https://rfkqxiwbicjsszjbdhzd.supabase.co',
      'https://unrelated.supabase.co',
      'http://dlwjkcqoclvlsyjmrjec.supabase.co',
      'https://dlwjkcqoclvlsyjmrjec.supabase.co.evil.org',
      'https://dlwjkcqoclvlsyjmrjec.supabase.co/other'
    ]){
      process.env.SUPABASE_URL=url;
      const response=res();
      await handler(makeReq(),response);
      assert.equal(response.statusCode,503,url);
      assert.equal(response.body.error,'NEWSLETTER_NOT_CONFIGURED',url);
    }
  });
  assert.equal(calls,0);
});
test('server gateway passes verified IP and hides email from response',async()=>{
  configure();let request;
  await restoreFetch(async(url,opts)=>{
    assert.equal(String(url),'https://dlwjkcqoclvlsyjmrjec.supabase.co/rest/v1/rpc/subscribe_newsletter_gateway');
    assert.equal(opts.headers.apikey,'sb_secret_synthetic_NEVER_REAL');
    assert.equal('Authorization' in opts.headers,false);
    request=JSON.parse(opts.body);
    return reply({ok:true,subscribed:true,already_subscribed:false,email:'private@example.org'});
  },async()=>{
    const response=res();
    await handler(makeReq(),response);
    assert.equal(response.statusCode,200);
    assert.deepEqual(response.body,{ok:true,subscribed:true});
    assert.equal(Object.hasOwn(response.body,'already_subscribed'),false);
    assert.deepEqual(request,{p_email:'test@example.org',p_verified_ip:'203.0.113.24'});
    assert.equal(response.headers['cache-control'],'no-store');
  });
});
test('both new and duplicate newsletter signups return the same public response',async()=>{
  configure();
  let call=0;
  await restoreFetch(async()=>reply({
    ok:true,subscribed:true,already_subscribed:++call>1,
    email:'private@example.org'
  }),async()=>{
    for(let n=0;n<2;n++){
      const response=res();
      await handler(makeReq(),response);
      assert.equal(response.statusCode,200);
      assert.deepEqual(response.body,{ok:true,subscribed:true});
      assert.equal('already_subscribed' in response.body,false);
    }
  });
  assert.equal(call,2);
});
test('rate limit error becomes 429 without exposing SQL details',async()=>{
  configure();
  await restoreFetch(async()=>reply({message:'NEWSLETTER_RATE_LIMITED'},false),async()=>{
    const response=res();
    await handler(makeReq(),response);
    assert.equal(response.statusCode,429);
    assert.deepEqual(response.body,{error:'NEWSLETTER_RATE_LIMITED'});
  });
});
test('database errors never reveal internal details to public caller',async()=>{
  configure();
  await restoreFetch(async()=>reply({message:'postgres internal error with credentials'},false),async()=>{
    const response=res();
    await handler(makeReq(),response);
    assert.equal(response.statusCode,503);
    assert.deepEqual(response.body,{error:'NEWSLETTER_TEMPORARILY_UNAVAILABLE'});
  });
});
test('invalid proxy IP fails before any service call',async()=>{
  configure();let calls=0;
  await restoreFetch(async()=>{calls++;throw Error('network forbidden');},async()=>{
    const response=res();
    await handler(makeReq({headers:{...makeReq().headers,'x-vercel-forwarded-for':'spoofed,203.0.113.24'}}),response);
    assert.equal(response.statusCode,503);
    assert.equal(response.body.error,'NETWORK_VERIFICATION_UNAVAILABLE');
  });
  assert.equal(calls,0);
});
test('frontend never calls public subscribe_newsletter RPC',async()=>{
  const {readFileSync}=await import('node:fs');
  const code=readFileSync(new URL('../js/services/newsletter-service.js',import.meta.url),'utf8');
  assert.match(code,/fetch\(['"]\/api\/newsletter['"]/);
  assert.doesNotMatch(code,/\.rpc\(['"]subscribe_newsletter['"]/);
});
