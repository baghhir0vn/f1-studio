// Compares ONLY metadata from a separately restored database.
// NOT proof of row restoration, actual Storage object contents, backups, or recovery.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lists=[
  ['requiredPublicTables','publicTables'],
  ['requiredCriticalFunctions','criticalFunctions'],
  ['requiredPrivateStorageBuckets','privateStorageBuckets'],
  ['requiredPublicStorageBuckets','publicStorageBuckets']
];
const uniqStrings = values=> Array.isArray(values)
  && values.every(x=>typeof x==='string'&&x.length>0)
  && new Set(values).size===values.length;

export function checkRestoreStructure(baseline, candidate){
  const reasons=[];
  if(baseline?.schemaVersion!==1||candidate?.schemaVersion!==1 ||
     candidate?.metadataOnly!==true){
    reasons.push('Invalid or missing read-only metadata inventory');
  }
  for(const [expectedKey,actualKey] of lists){
    const wanted=baseline?.[expectedKey],got=candidate?.[actualKey];
    if(!uniqStrings(wanted)||!uniqStrings(got)){
      reasons.push(actualKey+': inventory shape invalid');
      continue;
    }
    const missing=wanted.filter(x=>!got.includes(x));
    for(const name of missing) reasons.push(actualKey+': missing '+name);
  }
  const disabled=candidate?.rlsDisabledPublicTables;
  if(!uniqStrings(disabled)){
    reasons.push('RLS status inventory missing or malformed');
  }else{
    const needed=new Set(baseline?.requiredPublicTables||[]);
    for(const table of disabled.filter(t=>needed.has(t)))
      reasons.push('RLS disabled on restored table '+table);
  }
  const expectedPrivate=new Set(baseline?.requiredPrivateStorageBuckets||[]);
  const observedPublic=new Set(candidate?.publicStorageBuckets||[]);
  for(const name of expectedPrivate){
    if(observedPublic.has(name))
      reasons.push('Private Storage bucket is public: '+name);
  }
  if(baseline?.productionBackupVerified!==false ||
     baseline?.independentRestoreVerified!==false ||
     baseline?.storageObjectsBackedUp!==false){
    reasons.push('Baseline must not claim unproven backup/restore success');
  }
  return {
    structuralMatch:reasons.length===0,
    reasons,
    warning:'Metadata-only check. It cannot verify stored customer data, actual Storage files, auth configuration, encryption keys, or a working backup restore.'
  };
}

const direct=process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1];
if(direct){
  const baseline=JSON.parse(readFileSync(new URL('../security-backup-structure-baseline.json',import.meta.url),'utf8'));
  const filename=process.argv[2];
  if(!filename){
    console.error('Usage: node tools/verify-restore-structure.mjs <candidate-inventory.json>');
    process.exitCode=2;
  }else{
    const input=JSON.parse(readFileSync(filename,'utf8'));
    // Supports the output object from the SQL Editor, or a direct inventory.
    const candidate=Array.isArray(input) ? input[0]?.inventory : input?.inventory || input;
    const result=checkRestoreStructure(baseline,candidate);
    console.log(result.structuralMatch ? 'STRUCTURE CHECK PASS (backup/data NOT verified)' :
      'STRUCTURE CHECK FAIL (do not approve release)');
    for(const reason of result.reasons)console.log(' - '+reason);
    console.log(result.warning);
    if(!result.structuralMatch)process.exitCode=1;
  }
}
