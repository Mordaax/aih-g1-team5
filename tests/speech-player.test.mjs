import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechPlayer } from '../lib/speech-player.ts';

function harness(fetcher=async()=>new Response(new Blob(['mp3'],{type:'audio/mpeg'}),{headers:{'Content-Type':'audio/mpeg'}})){
  const states=[],errors=[],audios=[],revoked=[];
  const player=createSpeechPlayer({fetch:fetcher,onState:s=>states.push(s),onError:e=>errors.push(e),createObjectURL:()=>`blob:${audios.length}`,revokeObjectURL:u=>revoked.push(u),createAudio:url=>{
    const audio={src:url,paused:true,onended:null,onerror:null,play:async()=>{audio.paused=false;},pause:()=>{audio.paused=true;}};
    audios.push(audio);return audio;
  }});
  return {player,states,errors,audios,revoked};
}
const input={messageId:'answer-th',text:'สวัสดี',language:'Thai',rate:0.9};

test('audio uses the answer language, pauses/resumes, and releases its URL on stop',async()=>{
  let payload;
  const h=harness(async(url,options)=>{assert.equal(url,'/api/speech');payload=JSON.parse(options.body);return new Response(new Blob(['audio']),{headers:{'Content-Type':'audio/mpeg'}});});
  await h.player.play(input);
  assert.equal(payload.language,'Thai');
  assert.equal(h.states.at(-1).status,'playing');
  h.player.pause();assert.equal(h.states.at(-1).status,'paused');
  await h.player.resume();assert.equal(h.states.at(-1).status,'playing');
  h.player.stop();assert.equal(h.states.at(-1).status,'idle');
  assert.deepEqual(h.revoked,['blob:0']);
});

test('stopping a pending request prevents late audio from playing',async()=>{
  let resolve;
  const h=harness(()=>new Promise(r=>{resolve=r;}));
  const pending=h.player.play(input);
  h.player.stop();
  resolve(new Response(new Blob(['audio']),{headers:{'Content-Type':'audio/mpeg'}}));
  await pending;
  assert.equal(h.audios.length,0);
  assert.equal(h.states.at(-1).status,'idle');
});

test('stale ended events cannot clear a newer answer and replay reuses audio',async()=>{
  let fetches=0;
  const h=harness(async()=>{fetches++;return new Response(new Blob(['audio']),{headers:{'Content-Type':'audio/mpeg'}});});
  await h.player.play(input);
  const staleEnded=h.audios[0].onended;
  await h.player.play({...input,messageId:'answer-cn',text:'你好',language:'Mandarin Chinese'});
  staleEnded();
  assert.equal(h.states.at(-1).messageId,'answer-cn');
  await h.player.play(input);
  assert.equal(fetches,2);
  h.player.dispose();
});

test('Azure configuration errors return to idle with a useful message',async()=>{
  const h=harness(async()=>Response.json({error:'Read-aloud is not configured yet.'},{status:503}));
  await h.player.play(input);
  assert.equal(h.states.at(-1).status,'idle');
  assert.match(h.errors[0],/not configured/);
  assert.equal(h.audios.length,0);
});
