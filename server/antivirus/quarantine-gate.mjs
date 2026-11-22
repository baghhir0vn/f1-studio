// Quarantine state-machine core (worker only). NOT wired to live Storage.
// The caller must authenticate the scan job and enforce storage RLS. Never
// grant browser writes into the trusted final bucket or verdict table.
import { createHash } from 'node:crypto';
import { MAX_ANTIVIRUS_BYTES, AntivirusScanError } from './clamd-instream.mjs';

export async function scanQuarantinedFile({
  objectId, readQuarantinedBytes, scanBytes, publishVerifiedBytes, recordVerdict
} = {}) {
  if (typeof objectId!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(objectId)||
      [readQuarantinedBytes,scanBytes,publishVerifiedBytes,recordVerdict].some(x=>typeof x!=='function'))
    throw new AntivirusScanError('ANTIVIRUS_INVALID_JOB');

  let digest;
  try {
    const source=await readQuarantinedBytes(objectId);
    if(!Buffer.isBuffer(source)||source.length<1||source.length>MAX_ANTIVIRUS_BYTES)
      throw new AntivirusScanError('ANTIVIRUS_FILE_SIZE');
    // Detached copy ensures the exact bytes scanned are the bytes published.
    const bytes=Buffer.from(source);
    digest=createHash('sha256').update(bytes).digest('hex');
    const verdict=await scanBytes(bytes);
    if(verdict?.status==='infected'){
      await recordVerdict({objectId,sha256:digest,status:'infected'});
      return {status:'infected'};
    }
    if(verdict?.status!=='clean')throw new AntivirusScanError('ANTIVIRUS_BAD_RESPONSE');
    // A real adapter must publish to a non-readable staging location and make
    // the trusted final path visible only after an atomic verified ledger transition.
    await publishVerifiedBytes({objectId,bytes:Buffer.from(bytes),sha256:digest});
    await recordVerdict({objectId,sha256:digest,status:'clean'});
    return {status:'clean',sha256:digest};
  }catch(err){
    // Fail closed: do not call publishVerifiedBytes on scan failures.
    try{await recordVerdict({objectId,sha256:digest||null,status:'failed'});}catch{}
    throw new AntivirusScanError('ANTIVIRUS_SCAN_FAILED');
  }
}
