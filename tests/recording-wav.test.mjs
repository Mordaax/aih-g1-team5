import test from 'node:test';
import assert from 'node:assert/strict';
import { wavFromSamples } from '../lib/recording-wav.ts';
test('fallback WAV describes mono 16 kHz PCM16 and encodes clipped samples in little endian',()=>{
  const buffer=wavFromSamples(new Float32Array([-1,0,1,2]));const view=new DataView(buffer);
  assert.equal(Buffer.from(buffer).toString('ascii',0,4),'RIFF');
  assert.equal(Buffer.from(buffer).toString('ascii',8,12),'WAVE');
  assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(24,true),16000);
  assert.equal(view.getUint16(34,true),16);assert.equal(view.getUint32(40,true),8);
  assert.deepEqual([44,46,48,50].map(i=>view.getInt16(i,true)),[-32768,0,32767,32767]);
});
