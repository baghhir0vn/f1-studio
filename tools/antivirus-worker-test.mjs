// No production Supabase, real customer bytes, external network or ClamAV required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { scanWithClamd, MAX_ANTIVIRUS_BYTES } from '../server/antivirus/clamd-instream.mjs';
import { scanQuarantinedFile } from '../server/antivirus/quarantine-gate.mjs';

async function withFakeClamd(reply,callback){
  const dir=await mkdtemp(join(tmpdir(),'f1-clamd-'));
  const path=join(dir,'socket');
  const stream=[];
  let requestedBytes=Buffer.alloc(0);
  const server=createServer(socket=>{
    let chunks=Buffer.alloc(0);
    socket.on('data',part=>{
      chunks=Buffer.concat([chunks,part]);
      if(chunks.length<10 || chunks.subarray(0,10).toString()!=='zINSTREAM\0')return;
      let offset=10;
      const segments=[];
      while(offset+4<=chunks.length){
        const length=chunks.readUInt32BE(offset);offset+=4;
        if(length===0){
          requestedBytes=Buffer.concat(segments);
          socket.end(reply);
          return;
        }
        if(offset+length>chunks.length)return;
        segments.push(chunks.subarray(offset,offset+length));
        offset+=length;
      }
    });
  });
  await new Promise((resolve,reject)=>server.once('error',reject).listen(path,resolve));
  try{await callback(path,()=>requestedBytes);}
  finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
}

test('clean ClamAV response proves INSTREAM frames contain the input bytes',async()=>{
  await withFakeClamd('stream: OK\0',async(path,getBytes)=>{
    const bytes=Buffer.from('Synthetic clean image bytes');
    const result=await scanWithClamd(bytes,{socketPath:path});
    assert.deepEqual(result,{status:'clean'});
    assert.deepEqual(getBytes(),bytes);
  });
});

test('synthetic FOUND response blocks a file without uploading real malware',async()=>{
  await withFakeClamd('stream: Test-Signature FOUND\0',async(path)=>{
    assert.equal((await scanWithClamd(Buffer.from('fictional'),{socketPath:path})).status,'infected');
  });
});

test('scanner errors or missing daemon never count as clean',async()=>{
  await withFakeClamd('stream: ERROR\0',async(path)=>{
    await assert.rejects(()=>scanWithClamd(Buffer.from('synthetic'),{socketPath:path}),
      error=>error.code==='ANTIVIRUS_BAD_RESPONSE');
  });
  await assert.rejects(()=>scanWithClamd(Buffer.from('a'),{socketPath:'/nonexistent/f1-clamd.sock'}),
    error=>error.code==='ANTIVIRUS_UNAVAILABLE');
  await assert.rejects(()=>scanWithClamd(Buffer.alloc(MAX_ANTIVIRUS_BYTES+1),{socketPath:'/none'}),
    error=>error.code==='ANTIVIRUS_FILE_SIZE');
  await assert.rejects(()=>scanWithClamd(Buffer.from('a'),{}),
    error=>error.code==='ANTIVIRUS_NOT_CONFIGURED');
});

test('quarantine only publishes the exact bytes passed to scanner after a clean verdict',async()=>{
  const payload=Buffer.from('fictional customer image');
  const events=[];
  let scanDigest, publishedDigest;
  const result=await scanQuarantinedFile({
    objectId:'syntheticFile01',
    readQuarantinedBytes:async()=>payload,
    scanBytes:async b=>{
      scanDigest=createHash('sha256').update(b).digest('hex');
      payload.fill(0); // source is mutated after scanner received a detached copy
      return {status:'clean'};
    },
    publishVerifiedBytes:async({bytes,sha256})=>{
      publishedDigest=createHash('sha256').update(bytes).digest('hex');
      assert.equal(sha256,publishedDigest);
      events.push('publish');
    },
    recordVerdict:async({status})=>events.push(status)
  });
  assert.deepEqual(events,['publish','clean']);
  assert.equal(result.status,'clean');
  assert.equal(scanDigest,publishedDigest);
});

test('infected, unavailable and malformed scan results cannot publish',async()=>{
  for(const response of [{status:'infected'},null,{status:'unknown'}]){
    let publishCount=0;
    const events=[];
    const options={
      objectId:'syntheticFile02',
      readQuarantinedBytes:async()=>Buffer.from('fictional'),
      scanBytes:async()=>response,
      publishVerifiedBytes:async()=>publishCount++,
      recordVerdict:async({status})=>events.push(status)
    };
    if(response?.status==='infected')
      assert.equal((await scanQuarantinedFile(options)).status,'infected');
    else await assert.rejects(()=>scanQuarantinedFile(options));
    assert.equal(publishCount,0);
    assert.ok(events.includes(response?.status==='infected'?'infected':'failed'));
  }
  let called=false;
  await assert.rejects(()=>scanQuarantinedFile({
    objectId:'syntheticFile03',readQuarantinedBytes:async()=>Buffer.from('x'),
    scanBytes:async()=>{throw Error('scanner offline')},
    publishVerifiedBytes:async()=>{called=true},
    recordVerdict:async()=>{}
  }));
  assert.equal(called,false);
});
