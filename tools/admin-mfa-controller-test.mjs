// Real admin MFA UI controller tests, run with fake DOM and Supabase API.
// No browser, production user, password, network or actual TOTP factor is used.
import test from 'node:test';
import assert from 'node:assert/strict';

function deferred(){
  let resolve, reject;
  const promise=new Promise((ok,fail)=>{ resolve=ok; reject=fail; });
  return {promise,resolve,reject};
}
function element(){
  return {
    value:'',textContent:'',hidden:false,disabled:false,dataset:{},
    classList:{contains:()=>false},
    removeAttribute(attr){if(attr==='src')this.src='';},
    setAttribute(){},focus(){},replaceChildren(...nodes){this.children=nodes;},
    src:''
  };
}
const dom=new Map();
globalThis.document={
  getElementById(id){
    if(id==='toast')return null; // Do not start timeouts from toast UI
    if(!dom.has(id))dom.set(id,element());
    return dom.get(id);
  },
  createElement(){return element();}
};
globalThis.localStorage={getItem:()=>null};
const factorId='123e4567-e89b-42d3-a456-426614174000';
const verified=[{id:factorId,status:'verified',friendly_name:'Test Authenticator'}];
let aal='aal1';
let assuranceHandler=async()=>({data:{currentLevel:aal,nextLevel:'aal2'},error:null});
let factorsHandler=async()=>({data:{totp:verified},error:null});
let enrollmentHandler=async()=>({data:{
  id:factorId,totp:{
    qr_code:'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>',
    secret:'SYNTHETIC-NOT-REAL'
  }
},error:null});
let verifyHandler=async()=>({data:{access_token:'FAKE'},error:null});

globalThis.window={
  location:{origin:'https://isolated-preview.example'},
  supabase:{createClient:()=>({
    auth:{mfa:{
      getAuthenticatorAssuranceLevel:()=>assuranceHandler(),
      listFactors:()=>factorsHandler(),
      enroll:()=>enrollmentHandler(),
      challenge:async()=>({data:{id:'test-challenge'},error:null}),
      verify:()=>verifyHandler()
    }}
  })}
};

const {state:s,ctx}=await import('../js/state.js');
const {initAdminMfa}=await import('../js/admin-mfa.js');
let openCount=0;
ctx.updateAdminButton=()=>{};
ctx.stopAdminRealtime=()=>{};
ctx.startAdminRealtime=async()=>{};
ctx.openDialog=()=>{openCount++;};
ctx.closeDialog=()=>{};
initAdminMfa();
function reset(){
  ctx.resetAdminMfaState();
  s.authUser={id:'a0000000-0000-4000-8000-000000000001',role:'admin',blocked:false};
  s.adminMfaAssured=false;
  aal='aal1';
  assuranceHandler=async()=>({data:{currentLevel:aal,nextLevel:'aal2'},error:null});
  factorsHandler=async()=>({data:{totp:verified},error:null});
  enrollmentHandler=async()=>({data:{
    id:factorId,totp:{qr_code:'data:image/svg+xml;utf8,<svg/>',secret:'SYNTHETIC-NOT-REAL'}
  },error:null});
  verifyHandler=async()=>({data:{},error:null});
}
test('a slow MFA check is ignored after cross-tab sign-out',async()=>{
  reset();
  const slow=deferred();
  assuranceHandler=()=>slow.promise;
  const attempt=ctx.checkAdminMfa({prompt:false});
  s.authUser=null;
  ctx.resetAdminMfaState();
  slow.resolve({data:{currentLevel:'aal2',nextLevel:'aal2'},error:null});
  await attempt;
  assert.notEqual(s.adminMfaAssured,true);
});
test('a canceled QR enrollment never displays its late secret',async()=>{
  reset();
  factorsHandler=async()=>({data:{totp:[]},error:null});
  await ctx.checkAdminMfa({prompt:false});
  const slow=deferred();
  enrollmentHandler=()=>slow.promise;
  const attempt=ctx.startAdminMfaEnrollment();
  ctx.closeAdminMfa();
  slow.resolve({data:{
    id:factorId,totp:{qr_code:'data:image/svg+xml;utf8,<svg/>',secret:'MUST-NOT-APPEAR'}
  },error:null});
  await attempt;
  assert.equal(document.getElementById('adminMfaSecret').textContent,'');
  assert.equal(document.getElementById('adminMfaQr').src,'');
  assert.notEqual(s.adminMfaAssured,true);
});
test('a stale verified MFA result cannot unlock a new session for the same admin',async()=>{
  reset();
  await ctx.checkAdminMfa({prompt:false});
  document.getElementById('adminMfaCode').value='123456';
  document.getElementById('adminMfaFactor').value=factorId;
  const slow=deferred();
  verifyHandler=()=>slow.promise;
  const attempt=ctx.submitAdminMfaCode();
  ctx.resetAdminMfaState();
  // Same user ID, new AAL1 session; old TOTP response is not authorization.
  s.authUser={id:'a0000000-0000-4000-8000-000000000001',role:'admin',blocked:false};
  await ctx.checkAdminMfa({prompt:false});
  aal='aal2'; // The stale old verification would otherwise appear successful.
  slow.resolve({data:{access_token:'FAKE-OLD-SESSION'},error:null});
  await attempt;
  assert.notEqual(s.adminMfaAssured,true);
});
test('valid AAL2 verification unlocks current admin; a logout revokes that gate',async()=>{
  reset();
  await ctx.checkAdminMfa({prompt:false});
  document.getElementById('adminMfaCode').value='123456';
  document.getElementById('adminMfaFactor').value=factorId;
  verifyHandler=async()=>{aal='aal2';return {data:{},error:null};};
  await ctx.submitAdminMfaCode();
  assert.equal(s.adminMfaAssured,true);
  s.authUser=null;
  ctx.resetAdminMfaState();
  assert.equal(s.adminMfaAssured,false);
});
