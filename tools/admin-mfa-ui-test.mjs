// Tests do not call real Supabase or create users/factors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ids = () => readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const apiCode = () => readFileSync(new URL('../js/admin.js', import.meta.url), 'utf8');
const appCode = () => readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const authCode = () => readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');

let verified = false;
let verifiedLevel = 'aal1';
let enrolled = false;
let challengeCalls = 0;
let verificationCalls = 0;
const factorId = 'ab71902b-141f-46fb-9870-424200000001';
const fakeClient = {
  auth: { mfa: {
    getAuthenticatorAssuranceLevel: async () => ({
      data: { currentLevel: verifiedLevel, nextLevel: 'aal2' }, error: null
    }),
    listFactors: async () => ({
      data: { totp: [
        { id: factorId, status: 'verified', friendly_name: 'Main phone' },
        { id: '22222222-2222-4222-8222-222222222222', status: 'unverified' }
      ] }, error: null
    }),
    enroll: async ({factorType}) => {
      assert.equal(factorType, 'totp');
      enrolled = true;
      return { data: { id: factorId, totp: {
        qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>',
        secret: 'SYNTHETIC-TEST-ONLY'
      } } };
    },
    challenge: async ({factorId: id}) => {
      assert.equal(id, factorId);
      challengeCalls++;
      return { data: { id: 'challenge-1' } };
    },
    verify: async ({factorId: id,challengeId,code}) => {
      assert.equal(id, factorId);
      assert.equal(challengeId, 'challenge-1');
      assert.equal(code, '123456');
      verificationCalls++;
      return { data: { access_token: 'FAKE-TOKEN-DO-NOT-USE' } };
    }
  } }
};

globalThis.window = { location: { origin: 'https://isolated-preview.example' },
  supabase: { createClient: () => fakeClient } };
const { adminMfaService } = await import('../js/services/admin-mfa-service.js');

test('factor enumeration excludes unverified factors', async () => {
  const factors = await adminMfaService.factors();
  assert.equal(factors.length, 1);
  assert.equal(factors[0].id, factorId);
});

test('enrollment uses Supabase TOTP enrollment instead of generating or persisting secrets', async () => {
  const result = await adminMfaService.startEnrollment();
  assert.equal(enrolled, true);
  assert.equal(result.factorId, factorId);
  assert.ok(result.qr.startsWith('data:image/svg+xml'));
  assert.equal(result.secret, 'SYNTHETIC-TEST-ONLY');
});

test('invalid verification input never calls remote API', async () => {
  const before = challengeCalls;
  await assert.rejects(() => adminMfaService.verify(factorId, '12345'), /MFA_CODE_INVALID/);
  await assert.rejects(() => adminMfaService.verify(factorId, '1234567'), /MFA_CODE_INVALID/);
  await assert.rejects(() => adminMfaService.verify('invalid', '123456'), /MFA_CODE_INVALID/);
  assert.equal(challengeCalls, before);
});

test('a valid TOTP code is insufficient unless the session upgrades to AAL2', async () => {
  verifiedLevel = 'aal1';
  await assert.rejects(() => adminMfaService.verify(factorId, '123456'), /MFA_ASSURANCE_NOT_UPGRADED/);
  assert.equal(verificationCalls, 1);
  verifiedLevel = 'aal2';
  const result = await adminMfaService.verify(factorId, '123456');
  assert.equal(result.currentLevel, 'aal2');
  assert.equal(verificationCalls, 2);
});

test('admin UI is gated to verified Preview MFA, and account bootstrap reaches MFA flow', () => {
  assert.match(apiCode(), /s\.adminMfaAssured === true/);
  assert.match(apiCode(), /s\.authUser\.role === "admin"/);
  assert.match(authCode(), /ctx\.promptAdminMfa\?\.\(\)/);
  assert.match(authCode(), /ctx\.checkAdminMfa\?\.\(\{prompt:true\}\)/);
  assert.match(appCode(), /initAdminMfa\(\)/);
  assert.match(appCode(), /initAdmin\(\);\s*initAdminMfa\(\);/);
  const html = ids();
  for(const id of ['adminMfaModal','adminMfaStatus','adminMfaStart','adminMfaQr',
    'adminMfaSecret','adminMfaFactor','adminMfaCode','adminMfaSubmit',
    'adminMfaAddBackup','adminMfaRetryButton']){
    assert.ok(html.includes('id="'+id+'"'), 'Missing MFA control '+id);
  }
  assert.match(html, /css\/admin-mfa\.css/);
});
