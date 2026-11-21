import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateReleaseEvidence, REQUIRED_CONTROLS } from './security-release-readiness.mjs';
const manifest=JSON.parse(readFileSync(new URL('../security-production-release-evidence.json',import.meta.url),'utf8'));
const now=Date.parse('2026-11-21T12:00:00Z');
const sha='c0ffee1234567890c0ffee1234567890c0ffee12';
const proof='https://github.com/baghhir0vn/f1-studio/actions/runs/44807414096';
const good = () => {
  const copy=structuredClone(manifest);
  copy.intendedProductionCommit=sha;
  copy.ownerApproval={approved:true,approvedAt:new Date(now-3600000).toISOString(),reference:proof};
  for(const key of REQUIRED_CONTROLS) copy.controls[key]={
    verified:true,verifiedAt:new Date(now-3600000).toISOString(),evidence:proof
  };
  return copy;
};
test('all current production release gates are blocked, not silently treated as complete',()=>{
  const result=evaluateReleaseEvidence(manifest,{sha,now});
  assert.equal(result.releaseReady,false);
  assert.ok(result.errors.length>=REQUIRED_CONTROLS.length+2);
  for (const item of REQUIRED_CONTROLS) assert.ok(result.errors.some(x=>x.startsWith(item)));
});
test('validator only allows a complete recent set of approvals for the exact commit',()=>{
  const result=evaluateReleaseEvidence(good(),{sha,now});
  assert.equal(result.releaseReady,true,JSON.stringify(result.errors));
  assert.equal(evaluateReleaseEvidence(good(),{sha: 'ab'.repeat(20),now}).releaseReady,false);
});
test('stale backup cannot pass even if all other conditions are complete',()=>{
  const data=good();
  data.controls['backup-freshness'].verifiedAt=new Date(now-40*3600000).toISOString();
  const result=evaluateReleaseEvidence(data,{sha,now});
  assert.equal(result.releaseReady,false);
  assert.ok(result.errors.some(x=>x.startsWith('backup-freshness')));
});
test('restore evidence expires and must be refreshed',()=>{
  const data=good();
  data.controls['database-restore'].verifiedAt=new Date(now-31*86400000).toISOString();
  const result=evaluateReleaseEvidence(data,{sha,now});
  assert.equal(result.releaseReady,false);
  assert.ok(result.errors.some(x=>x.startsWith('database-restore')));
});
test('untrusted or future-dated evidence cannot pass',()=>{
  const data=good();
  data.controls['alert-delivery'].evidence='file:///tmp/yes';
  assert.equal(evaluateReleaseEvidence(data,{sha,now}).releaseReady,false);
  data.controls['alert-delivery'].evidence=proof;
  data.controls['alert-delivery'].verifiedAt=new Date(now+3600000).toISOString();
  assert.equal(evaluateReleaseEvidence(data,{sha,now}).releaseReady,false);
});
test('wrong production targets and missing owner approval always block',()=>{
  let data=good();
  data.productionProjectId='dlwjkcqoclvlsyjmrjec';
  assert.equal(evaluateReleaseEvidence(data,{sha,now}).releaseReady,false);
  data=good();
  data.ownerApproval.approved=false;
  assert.equal(evaluateReleaseEvidence(data,{sha,now}).releaseReady,false);
});

test('malware scanning cannot be bypassed by release evidence',()=>{
  const control='malware-scan-storage-gate';
  assert.ok(REQUIRED_CONTROLS.includes(control),'Antivirus is a mandatory release gate');
  assert.equal(manifest.controls[control]?.verified,false,'Antivirus must remain unverified until real scanning works');
  const record=good();
  delete record.controls[control];
  const missing=evaluateReleaseEvidence(record,{sha,now});
  assert.equal(missing.releaseReady,false);
  assert.ok(missing.errors.some(x=>x.startsWith(control)));
  record.controls[control]={verified:false,verifiedAt:new Date(now-3600000).toISOString(),evidence:proof};
  const unverified=evaluateReleaseEvidence(record,{sha,now});
  assert.equal(unverified.releaseReady,false);
  assert.ok(unverified.errors.some(x=>x.startsWith(control)));
});
