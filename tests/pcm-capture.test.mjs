import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let Processor;
class HostProcessor {
  constructor() { this.messages=[]; this.port={postMessage:(value)=>this.messages.push(value)}; }
}
vm.runInNewContext(fs.readFileSync(new URL('../public/audio/pcm-capture.js',import.meta.url),'utf8'),{
  AudioWorkletProcessor:HostProcessor,Int16Array,Math,registerProcessor:(_name,ctor)=>{Processor=ctor;}
});
test('audio capture emits 512-sample PCM16 frames with clipping and silence-safe output',()=>{
  const processor=new Processor();
  const samples=new Float32Array(512);samples.set([-2,-1,0,1,2]);
  processor.process([[samples]]);
  const frame=processor.messages[0];
  assert.equal(frame.type,'pcm');assert.equal(frame.pcm.byteLength,1024);
  assert.deepEqual([...new Int16Array(frame.pcm).slice(0,5)],[-32768,-32768,0,32767,32767]);
});
test('stop flushes the partial frame before signalling EOF and does not capture later samples',()=>{
  const processor=new Processor();processor.process([[new Float32Array(128).fill(0.5)]]);
  assert.equal(processor.messages.length,0);
  processor.port.onmessage({data:'flush'});
  assert.equal(processor.messages[0].pcm.byteLength,256);
  assert.equal(processor.messages[1].type,'flushed');
  assert.equal(processor.process([[new Float32Array(128)]]),false);
  assert.equal(processor.messages.length,2);
});
