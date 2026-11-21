import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { MAX_ANTIVIRUS_BYTES, scanWithClamd } from './clamd-instream.mjs';
import { scanQuarantinedFile } from './quarantine-gate.mjs';

const socketPath = '/clamd/clamd.sock';
const cleanPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAFElEQVR4nGM0i5JkwA2Y8MiNYGkA2MMAvbRcTnUAAAAASUVORK5CYII=', 'base64');
// EICAR's standard inert test string. Only streamed to the offline test daemon.
const eicar = Buffer.from(String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`, 'ascii');

function runJob(bytes, scanPath = socketPath) {
  const staged = [];
  const verdicts = [];
  const result = scanQuarantinedFile({
    objectId: 'f1SmokeTest',
    readQuarantinedBytes: async () => bytes,
    scanBytes: payload => scanWithClamd(payload, { socketPath: scanPath }),
    publishVerifiedBytes: async object => { staged.push(object); },
    recordVerdict: async verdict => { verdicts.push(verdict); },
  });
  return { result, staged, verdicts };
}

test('ClamAV detects EICAR and quarantined bytes are not staged', async () => {
  assert.equal(eicar.length, 68);
  const { result, staged, verdicts } = runJob(eicar);
  assert.deepEqual(await result, { status: 'infected' });
  assert.equal(staged.length, 0);
  assert.equal(verdicts[0]?.status, 'infected');
});

test('ClamAV clears the PNG and the gate stages the scanned bytes', async () => {
  const { result, staged, verdicts } = runJob(cleanPng);
  const sha256 = createHash('sha256').update(cleanPng).digest('hex');
  assert.deepEqual(await result, { status: 'clean', sha256 });
  assert.deepEqual(staged, [{ objectId: 'f1SmokeTest', bytes: cleanPng, sha256 }]);
  assert.deepEqual(verdicts, [{ objectId: 'f1SmokeTest', sha256, status: 'clean' }]);
});

test('missing scanner and oversized uploads cannot be staged', async () => {
  const failures = [
    runJob(cleanPng, '/clamd/unavailable.sock'),
    runJob(Buffer.alloc(MAX_ANTIVIRUS_BYTES + 1)),
  ];
  await Promise.all(failures.map(async ({ result, staged, verdicts }) => {
    await assert.rejects(result, { code: 'ANTIVIRUS_SCAN_FAILED' });
    assert.equal(staged.length, 0);
    assert.equal(verdicts[0]?.status, 'failed');
  }));
});
