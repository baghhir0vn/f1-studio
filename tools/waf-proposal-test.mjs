// Offline safety guard for proposed WAF rate limiting. This does not alter Vercel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const proposal=JSON.parse(readFileSync(new URL('../security-waf-rate-limit-candidate.json',import.meta.url),'utf8'));
const conditions=proposal.conditions || [];
const expected={
  environment:'preview',
  host:'f1studio-git-security-preview-orde-9ffb80-nurlanbagirov834-7802.vercel.app',
  method:'POST',
  path:'/api/orders'
};
test('the WAF candidate is explicitly NOT activated',()=>{
  assert.equal(proposal.status,'PROPOSAL_ONLY_DO_NOT_APPLY');
  assert.ok(proposal.activationGates.length>=5);
  assert.equal(proposal.baseline.available,false);
});
test('WAF candidate matches exact Preview hostname, route and environment only',()=>{
  assert.equal(conditions.length,4,'Every restriction must be present and ANDed');
  for(const [key,value] of Object.entries(expected)){
    const matches=conditions.filter(c=>c.type===key && c.op==='eq');
    assert.equal(matches.length,1,key+' must have exactly one condition');
    assert.equal(matches[0].value,value,key+' match must be exact');
  }
  assert.equal(conditions.some(c=>c.op==='re'||c.op==='inc'),false);
});
test('candidate starts non-blocking and requires review before real limits',()=>{
  const rule=proposal.rateLimitCandidate;
  assert.equal(rule.algorithm,'fixed_window');
  assert.equal(rule.countingKey,'IP');
  assert.ok(rule.windowSeconds>=10&&rule.windowSeconds<=600);
  assert.equal(rule.initialExcessAction,'log');
  assert.equal(rule.sharedNATReviewRequired,true);
  assert.equal(rule.thresholdProvisional,true);
});
