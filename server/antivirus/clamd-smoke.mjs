import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { MAX_ANTIVIRUS_BYTES, scanWithClamd } from './clamd-instream.mjs';
import { createPreviewScanner } from './preview-worker.mjs';
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

test('Preview worker submits real ClamAV verdicts to the queue', async () => {
  const job = {
    object_id: '11111111-1111-4111-8111-111111111111',
    object_version: 'v1',
    object_path: 'orders/00000000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.png',
    lease: '33333333-3333-4333-8333-333333333333'
  };
  for (const { bytes, verdict } of [
    { bytes: cleanPng, verdict: 'clean' },
    { bytes: eicar, verdict: 'rejected' }
  ]) {
    const completed = [];
    const scanner = createPreviewScanner({
      serviceKey: 'sb_secret_offline_fixture',
      socketPath,
      request: async (url, options) => {
        const { pathname } = new URL(url);
        if (pathname === '/rest/v1/rpc/f1_claim_design_scan') return Response.json([job]);
        if (pathname === '/rest/v1/rpc/f1_finish_design_scan') {
          completed.push(JSON.parse(options.body));
          return Response.json(true);
        }
        assert.equal(pathname, '/storage/v1/object/authenticated/customer-designs/' + job.object_path);
        return new Response(bytes);
      }
    });
    assert.equal(await scanner.scanNext(), verdict);
    assert.deepEqual(completed, [{
      p_id: job.object_id,
      p_version: job.object_version,
      p_lease: job.lease,
      p_verdict: verdict,
      p_sha256: verdict === 'clean' ? createHash('sha256').update(bytes).digest('hex') : null
    }]);
  }
});
