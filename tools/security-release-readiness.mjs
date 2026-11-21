// F1 Studio production release readiness: fail closed until explicitly
// verified evidence is provided. No network, deployment, secrets or DB writes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REQUIRED_CONTROLS = Object.freeze([
  'backup-freshness','database-restore','storage-object-backup',
  'admin-mfa-aal2','checkout-end-to-end','newsletter-end-to-end',
  'authorization-negative-tests','alert-delivery',
  'production-secrets-domain','cutover-rollback',
  'malware-scan-storage-gate'
]);

const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
const isEvidenceRef = value => {
  if (typeof value !== 'string' || value.length < 14 || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) &&
      !url.username && !url.password &&
      !url.search && !url.hash;
  } catch { return false; }
};
const ageMs = (value, now) => {
  if (typeof value !== 'string') return Infinity;
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return Infinity;
  const age = now - stamp;
  return age >= 0 ? age : Infinity;
};

export function evaluateReleaseEvidence(record, { now = Date.now(), sha = '' } = {}) {
  const errors = [];
  if (!record || record.schemaVersion !== 1) errors.push('Invalid release evidence format');
  if (record?.productionProjectId !== 'rfkqxiwbicjsszjbdhzd') errors.push('Production Supabase project mismatch');
  if (record?.expectedVercelProjectId !== 'prj_aEmhZAJVlsXsoPsCc0KSCmwoI6BQ') errors.push('Production Vercel project mismatch');
  if (!isSha(record?.intendedProductionCommit)) errors.push('Exact intended production commit is not approved');
  if (!isSha(sha) || String(record?.intendedProductionCommit).toLowerCase() !== String(sha).toLowerCase())
    errors.push('Release SHA does not match attested commit');
  const approval = record?.ownerApproval;
  if (approval?.approved !== true || !isEvidenceRef(approval?.reference) ||
      ageMs(approval?.approvedAt, now) > 72 * 3600000)
    errors.push('Recent documented owner approval is missing');

  for (const name of REQUIRED_CONTROLS) {
    const proof = record?.controls?.[name];
    const maxAge = name === 'backup-freshness' ? 36 * 3600000 :
      name === 'database-restore' ? 30 * 86400000 :
      name === 'storage-object-backup' ? 7 * 86400000 :
      7 * 86400000;
    if (proof?.verified !== true || !isEvidenceRef(proof?.evidence) ||
        ageMs(proof?.verifiedAt, now) > maxAge) {
      errors.push(name + ': current proof missing / stale');
    }
  }
  return { releaseReady: errors.length === 0, errors };
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (direct) {
  const flags = new Set(process.argv.slice(2));
  const record = JSON.parse(readFileSync(new URL('../security-production-release-evidence.json',import.meta.url),'utf8'));
  const result = evaluateReleaseEvidence(record, {
    sha: process.env.F1_RELEASE_SHA || process.env.GITHUB_SHA || ''
  });
  if (flags.has('--report')) {
    console.log(result.releaseReady ? 'Ready for evidence review' :
      'NOT READY: production release requirements not verified');
    for(const error of result.errors) console.log(' - '+error);
  }
  if (flags.has('--release')) {
    if (!result.releaseReady) {
      console.error('PRODUCTION RELEASE BLOCKED: '+result.errors.length+
        ' missing/stale attestations. No deployment performed.');
      process.exitCode=1;
    } else {
      console.log('Evidence checklist complete. MANUAL APPROVAL and actual deployment safety checks still required.');
    }
  }
  if (!flags.has('--release') && !flags.has('--report')) {
    console.error('Usage: node tools/security-release-readiness.mjs --report | --release');
    process.exitCode=2;
  }
}
