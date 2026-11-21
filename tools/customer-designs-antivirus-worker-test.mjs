import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createPreviewScanner } from '../server/antivirus/preview-worker.mjs';
import { MAX_ANTIVIRUS_BYTES } from '../server/antivirus/clamd-instream.mjs';

const bytes = Buffer.from('synthetic image');
const job = {
  object_id: '11111111-1111-4111-8111-111111111111',
  object_version: 'v1',
  object_path: 'orders/00000000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.png',
  lease: '33333333-3333-4333-8333-333333333333'
};

async function exercise({ scan, download = bytes, saved = true }) {
  let completion;
  const scanner = createPreviewScanner({
    serviceKey: 'sb_secret_synthetic_fixture',
    socketPath: '/clamd/clamd.sock',
    scan,
    request: async (url, options) => {
      const target = new URL(url);
      assert.equal(target.hostname, 'dlwjkcqoclvlsyjmrjec.supabase.co');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.apikey, 'sb_secret_synthetic_fixture');
      if (target.pathname.endsWith('/f1_claim_design_scan')) return Response.json([job]);
      if (target.pathname.endsWith('/f1_finish_design_scan')) {
        completion = JSON.parse(options.body);
        return Response.json(saved);
      }
      assert.equal(target.pathname, '/storage/v1/object/authenticated/customer-designs/' + job.object_path);
      assert.equal(target.searchParams.get('cacheNonce'), job.lease);
      return new Response(download);
    }
  });
  const outcome = await scanner.scanNext();
  assert.equal(completion?.p_id, job.object_id);
  assert.equal(completion?.p_version, job.object_version);
  assert.equal(completion?.p_lease, job.lease);
  return { outcome, completion };
}

test('worker submits the digest of the exact bytes accepted by ClamAV', async () => {
  const { outcome, completion } = await exercise({ scan: async value => {
    assert.deepEqual(value, bytes);
    return { status: 'clean' };
  } });
  assert.equal(outcome, 'clean');
  assert.equal(completion.p_verdict, 'clean');
  assert.equal(completion.p_sha256, createHash('sha256').update(bytes).digest('hex'));
});

test('worker never approves infected or unavailable scans', async () => {
  const infected = await exercise({ scan: async () => ({ status: 'infected' }) });
  assert.equal(infected.outcome, 'rejected');
  const unavailable = await exercise({ scan: async () => { throw new Error('offline'); } });
  assert.equal(unavailable.outcome, 'retry');
  assert.equal(unavailable.completion.p_sha256, null);
});

test('worker rejects oversized bytes and reports an expired lease as stale', async () => {
  const big = await exercise({
    download: Buffer.alloc(MAX_ANTIVIRUS_BYTES + 1),
    scan: async () => assert.fail('oversized bytes reached ClamAV')
  });
  assert.equal(big.outcome, 'rejected');
  const stale = await exercise({ saved: false, scan: async () => ({ status: 'clean' }) });
  assert.equal(stale.outcome, 'stale');
});
