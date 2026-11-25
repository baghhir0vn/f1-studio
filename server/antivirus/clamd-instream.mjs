// Worker-side ClamAV INSTREAM client. NOT connected to the live F1 Studio uploads.
// Clamd must be installed in an isolated worker and accessed via a private UNIX socket.
// No customer bytes are sent to third-party malware-analysis services.
import { createConnection } from 'node:net';

export const MAX_ANTIVIRUS_BYTES = 10 * 1024 * 1024;

export class AntivirusScanError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AntivirusScanError';
    this.code = code;
  }
}

export async function scanWithClamd(bytes, {socketPath, timeoutMs=12000}={}) {
  if (!Buffer.isBuffer(bytes) || bytes.length===0 || bytes.length>MAX_ANTIVIRUS_BYTES)
    throw new AntivirusScanError('ANTIVIRUS_FILE_SIZE');
  if (typeof socketPath!=='string' || !socketPath.startsWith('/') ||
      socketPath.length>220 || socketPath.includes('\0'))
    throw new AntivirusScanError('ANTIVIRUS_NOT_CONFIGURED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs<100 || timeoutMs>60000)
    throw new AntivirusScanError('ANTIVIRUS_INVALID_TIMEOUT');

  return await new Promise((resolve,reject)=>{
    const socket=createConnection({path:socketPath});
    let finished=false, text='';
    const stop=(err,verdict)=>{
      if(finished)return;
      finished=true;
      socket.destroy();
      if(err) reject(new AntivirusScanError(err));
      else resolve(verdict);
    };
    socket.setTimeout(timeoutMs,()=>stop('ANTIVIRUS_TIMEOUT'));
    socket.on('error',()=>stop('ANTIVIRUS_UNAVAILABLE'));
    socket.on('end',()=>{ if(!finished)stop('ANTIVIRUS_BAD_RESPONSE'); });
    socket.on('data',chunk=>{
      text+=chunk.toString('utf8');
      if(text.length>1024)return stop('ANTIVIRUS_BAD_RESPONSE');
      if(!text.includes('\n')&&!text.includes('\0'))return;
      const answer=text.replace(/\0/g,'').trim();
      if(/^stream: OK$/.test(answer))return stop(null,{status:'clean'});
      if(/^stream: .{1,200} FOUND$/.test(answer))
        return stop(null,{status:'infected'});
      stop('ANTIVIRUS_BAD_RESPONSE');
    });
    socket.on('connect',()=>{
      socket.write(Buffer.from('zINSTREAM\0','utf8'));
      // INSTREAM protocol: four-byte big-endian chunk lengths; zero terminator.
      for(let offset=0;offset<bytes.length;offset+=65536){
        const chunk=bytes.subarray(offset,Math.min(bytes.length,offset+65536));
        const length=Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
