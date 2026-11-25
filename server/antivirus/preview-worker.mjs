import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { MAX_ANTIVIRUS_BYTES, scanWithClamd } from './clamd-instream.mjs';

const previewOrigin = 'https://dlwjkcqoclvlsyjmrjec.supabase.co';
const designBucket = 'customer-designs';
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const objectPath = new RegExp('^orders/' + uuid + '/' + uuid + '[.](jpg|jpeg|png|webp|pdf)$');

export function createPreviewScanner({
  serviceKey, socketPath, request = fetch, scan = scanWithClamd
} = {}) {
  if (!/^sb_secret_[A-Za-z0-9_-]+$|^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(serviceKey ?? '')) {
    throw new Error('F1_AV_SUPABASE_SERVICE_KEY_REQUIRED');
  }
  if (typeof socketPath !== 'string' || !socketPath.startsWith('/')) {
    throw new Error('F1_AV_UNIX_SOCKET_REQUIRED');
  }

  const headers = { apikey: serviceKey };
  if (serviceKey.startsWith('eyJ')) headers.authorization = 'Bearer ' + serviceKey;

  async function call(path, options = {}) {
    const response = await request(previewOrigin + path, {
      ...options,
      headers: { ...headers, ...options.headers },
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error('PREVIEW_REQUEST_FAILED_' + response.status);
    }
    return response;
  }

  async function rpc(name, body = {}) {
    const response = await call('/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async function readBytes(path, lease) {
    if (!objectPath.test(path)) throw new Error('INVALID_DESIGN_PATH');
    const key = path.split('/').map(encodeURIComponent).join('/');
    const response = await call('/storage/v1/object/authenticated/' + designBucket + '/' + key +
      '?cacheNonce=' + encodeURIComponent(lease), { cache: 'no-store' });
    const reader = response.body?.getReader();
    if (!reader) throw new Error('DESIGN_BODY_MISSING');
    let size = 0;
    const parts = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ANTIVIRUS_BYTES) throw new Error('DESIGN_TOO_LARGE');
        parts.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (!size) throw new Error('DESIGN_BODY_EMPTY');
    return Buffer.concat(parts, size);
  }

  async function scanNext() {
    const jobs = await rpc('f1_claim_design_scan');
    if (!Array.isArray(jobs) || jobs.length > 1) throw new Error('INVALID_PREVIEW_JOB');
    const job = jobs[0];
    if (!job) return 'idle';
    const leaseFormat = new RegExp('^' + uuid + '$');
    if (!leaseFormat.test(job.lease) || !leaseFormat.test(job.object_id) ||
        typeof job.object_version !== 'string' || !job.object_version) throw new Error('INVALID_PREVIEW_JOB');

    let verdict = 'retry';
    let digest = null;
    try {
      const bytes = await readBytes(job.object_path, job.lease);
      const result = await scan(bytes, { socketPath });
      if (result.status === 'clean') {
        digest = createHash('sha256').update(bytes).digest('hex');
        verdict = 'clean';
      } else if (result.status === 'infected') {
        verdict = 'rejected';
      }
    } catch (error) {
      if (error.message === 'DESIGN_TOO_LARGE' || error.message === 'DESIGN_BODY_EMPTY') verdict = 'rejected';
    }
    // The DB binds the verdict to this lease and to the same immutable Storage version.
    const saved = await rpc('f1_finish_design_scan', {
      p_id: job.object_id,
      p_version: job.object_version,
      p_lease: job.lease,
      p_verdict: verdict,
      p_sha256: digest
    });
    return saved === true ? verdict : 'stale';
  }

  return { scanNext };
}

async function main() {
  const scanner = createPreviewScanner({
    serviceKey: process.env.F1_AV_SUPABASE_SERVICE_KEY,
    socketPath: process.env.F1_AV_SOCKET ?? '/clamd/clamd.sock'
  });
  const stop = new AbortController();
  process.once('SIGTERM', () => stop.abort());
  process.once('SIGINT', () => stop.abort());

  let connected = false;
  while (!stop.signal.aborted) {
    let outcome;
    try {
      outcome = await scanner.scanNext();
      if (!connected) {
        console.info('Preview scan queue connected.');
        connected = true;
      }
      if (outcome !== 'idle') console.info('Design scan: ' + outcome);
    } catch {
      console.error('Design scan request failed. Pending files remain quarantined.');
    }
    if (outcome === 'idle' || !outcome) {
      await delay(4000, null, { signal: stop.signal }).catch(() => {});
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Preview scanner startup failed. Check the worker credentials and socket configuration.');
    process.exitCode = 1;
  });
}
