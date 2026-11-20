import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkRestoreStructure} from './verify-restore-structure.mjs';

const baseline=JSON.parse(readFileSync(new URL('../security-backup-structure-baseline.json',import.meta.url),'utf8'));
function healthy(){
  return {
    schemaVersion:1,metadataOnly:true,
    publicTables:[...baseline.requiredPublicTables],
    criticalFunctions:[...baseline.requiredCriticalFunctions],
    privateStorageBuckets:[...baseline.requiredPrivateStorageBuckets],
    publicStorageBuckets:[...baseline.requiredPublicStorageBuckets],
    rlsDisabledPublicTables:[]
  };
}
test('matching restored schema metadata is useful but never claims data backup success',()=>{
  const result=checkRestoreStructure(baseline,healthy());
  assert.equal(result.structuralMatch,true,JSON.stringify(result.reasons));
  assert.match(result.warning,/cannot verify stored customer data/);
});
test('missing orders, reviews or auth logic fails closed',()=>{
  const actual=healthy();
  actual.publicTables=actual.publicTables.filter(x=>!['orders','reviews'].includes(x));
  actual.criticalFunctions=actual.criticalFunctions.filter(x=>x!=='is_admin');
  const result=checkRestoreStructure(baseline,actual);
  assert.equal(result.structuralMatch,false);
  assert.ok(result.reasons.some(x=>x.includes('orders')));
  assert.ok(result.reasons.some(x=>x.includes('is_admin')));
});
test('private customer bucket cannot become public unnoticed',()=>{
  const actual=healthy();
  actual.privateStorageBuckets=actual.privateStorageBuckets.filter(x=>x!=='customer-designs');
  actual.publicStorageBuckets.push('customer-designs');
  const result=checkRestoreStructure(baseline,actual);
  assert.equal(result.structuralMatch,false);
  assert.ok(result.reasons.some(x=>x.includes('Private Storage bucket is public')));
});
test('a restored table with disabled RLS fails even when all objects exist',()=>{
  const actual=healthy();
  actual.rlsDisabledPublicTables=['orders'];
  const result=checkRestoreStructure(baseline,actual);
  assert.equal(result.structuralMatch,false);
  assert.ok(result.reasons.some(x=>x.includes('RLS disabled')));
});
test('partial or malformed SQL output cannot silently pass',()=>{
  assert.equal(checkRestoreStructure(baseline,{}).structuralMatch,false);
  const actual=healthy();
  actual.privateStorageBuckets=null;
  assert.equal(checkRestoreStructure(baseline,actual).structuralMatch,false);
});
test('a falsified baseline claiming backups already exist is rejected',()=>{
  const fake=structuredClone(baseline);
  fake.productionBackupVerified=true;
  assert.equal(checkRestoreStructure(fake,healthy()).structuralMatch,false);
});
