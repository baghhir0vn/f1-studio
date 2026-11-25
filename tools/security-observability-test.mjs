// Offline monitoring tests: no live request, Supabase key or customer data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecurityResponder } from '../server/security-observability.js';

function response() {
  const res = {statusCode:null, headers:{}, body:null};
  res.setHeader=(key,value)=>{res.headers[key.toLowerCase()]=value;return res;};
  res.status=status=>{res.statusCode=status;return res;};
  res.json=body=>{res.body=body;return res;};
  return res;
}
async function captured(run) {
  const original=console.warn;
  const lines=[];
  console.warn=(...parts)=>{lines.push(parts.map(String).join(' '));};
  try {await run(lines);} finally {console.warn=original;}
}

test('safe correlation ID is new on each request, even if a caller forges a header',async()=>{
  await captured(async lines=>{
    const a=response(),b=response();
    createSecurityResponder(a,'checkout')(200,{ok:true});
    createSecurityResponder(b,'checkout')(200,{ok:true});
    for(const r of [a,b]){
      assert.match(r.headers['x-request-id'],/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal(r.headers['cache-control'],'no-store');
    }
    assert.notEqual(a.headers['x-request-id'],b.headers['x-request-id']);
    assert.equal(lines.length,0,'successful requests do not create a log event');
  });
});
test('API audit contains only fixed allowlisted fields and no PII',async()=>{
  await captured(async lines=>{
    const fakeEmail='privateuser@example.org';
    const fakePhone='0501234567';
    const fakeIp='203.0.113.73';
    const fakeToken='sb_secret_never-really-a-key';
    const res=response();
    const respond=createSecurityResponder(res,'newsletter');
    respond(429,{error:'NEWSLETTER_RATE_LIMITED',email:fakeEmail,phone:fakePhone,ip:fakeIp,token:fakeToken});
    assert.equal(res.statusCode,429);
    assert.equal(lines.length,1);
    const [label,json,...rest]=lines[0].split(' ');
    assert.equal(label,'F1_SECURITY_EVENT');
    assert.equal(rest.length,0);
    const payload=JSON.parse(json);
    assert.deepEqual(Object.keys(payload).sort(),['code','requestId','schema','scope','status'].sort());
    assert.deepEqual(payload,{
      schema:1,scope:'newsletter',status:429,code:'NEWSLETTER_RATE_LIMITED',
      requestId:res.headers['x-request-id']
    });
    for(const value of [fakeEmail,fakePhone,fakeIp,fakeToken]){
      assert.equal(lines[0].includes(value),false,'Sensitive fields must never reach logs');
    }
  });
});
test('unknown error strings are never interpolated into audit events',async()=>{
  await captured(async lines=>{
    const badError='PRIVATE-SECRET::privateperson@example.org\nINJECTED_EVENT';
    createSecurityResponder(response(),'checkout')(503,{error:badError});
    assert.equal(lines.length,1);
    assert.ok(lines[0].includes('"code":"UNCLASSIFIED"'));
    assert.equal(lines[0].includes(badError),false);
    assert.equal(lines[0].includes('privateperson'),false);
  });
});
test('expected success and low-risk validation failures are not logged',async()=>{
  await captured(async lines=>{
    createSecurityResponder(response(),'checkout')(200,{order:{orderCode:'F1-TEST'}});
    createSecurityResponder(response(),'checkout')(400,{error:'INVALID_ORDER'});
    createSecurityResponder(response(),'newsletter')(405,{error:'METHOD_NOT_ALLOWED'});
    assert.equal(lines.length,0);
  });
});
test('audit scope cannot be influenced by client-supplied names',()=>{
  assert.throws(()=>createSecurityResponder(response(),'../../../orders-private'),/UNSUPPORTED_AUDIT_SCOPE/);
});
