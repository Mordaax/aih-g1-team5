import test from 'node:test';
import assert from 'node:assert/strict';
import { getSpeechLanguage } from '../lib/speech-languages.ts';
import { createSpeechSynthesizer } from '../lib/azure-speech.ts';

test('Thai, Chinese aliases and every menu language have native neural voice choices', () => {
  assert.equal(getSpeechLanguage('Thai').locale,'th-TH');
  assert.equal(getSpeechLanguage('Chinese').locale,'zh-CN');
  assert.equal(getSpeechLanguage('Mandarin Chinese').voices[0].id,'zh-CN-XiaoxiaoNeural');
  assert.equal(getSpeechLanguage('zh-CN').locale,'zh-CN');
  assert.equal(getSpeechLanguage('Tagalog / Filipino').locale,'fil-PH');
  for(const name of ['English','Tagalog','Bahasa Indonesia','Burmese','Tamil','Bengali','Sinhala','Hindi','Khmer','Thai','Malay','Mandarin Chinese']){
    const config=getSpeechLanguage(name);
    assert.ok(config?.voices.length >= 2, name);
    assert.ok(config.voices.every(v=>v.id.startsWith(config.locale+'-')));
  }
  assert.equal(getSpeechLanguage('Imaginary Language'),undefined);
});

test('Azure gets Thai SSML with escaped text, the chosen voice and a gentle pace', async () => {
  let request;
  const synthesize=createSpeechSynthesizer({env:{AZURE_SPEECH_KEY:'test-key',AZURE_SPEECH_REGION:'southeastasia'},fetch:async(url,options)=>{
    request={url,...options};return new Response(new Uint8Array([73,68,51,1]),{headers:{'Content-Type':'audio/mpeg'}});
  }});
  const result=await synthesize({text:'สวัสดี <audio src="x"/> & test',language:'Thai',voice:'th-TH-PremwadeeNeural',rate:0.9});
  assert.equal(request.url,'https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1');
  assert.equal(request.headers['Ocp-Apim-Subscription-Key'],'test-key');
  assert.equal(request.headers['X-Microsoft-OutputFormat'],'audio-24khz-48kbitrate-mono-mp3');
  assert.match(request.body,/xml:lang="th-TH"/);
  assert.match(request.body,/name="th-TH-PremwadeeNeural"/);
  assert.match(request.body,/rate="-10%"/);
  assert.match(request.body,/&lt;audio src=&quot;x&quot;\/&gt; &amp; test/);
  assert.deepEqual([...result],[73,68,51,1]);
});

test('a mismatched voice, unsupported language and unsafe rate never reach Azure', async () => {
  const synthesize=createSpeechSynthesizer({env:{AZURE_SPEECH_KEY:'test-key',AZURE_SPEECH_REGION:'eastus'},fetch:async()=>{throw new Error('Must not fetch');}});
  for(const input of [
    {text:'你好',language:'Mandarin Chinese',voice:'en-US-JennyNeural'},
    {text:'Hello',language:'Imaginary Language'},
    {text:'สวัสดี',language:'Thai',rate:NaN},
    {text:'สวัสดี',language:'Thai',rate:20},
  ]) await assert.rejects(synthesize(input),error=>error.code==='VALIDATION');
});

test('Azure setup and quota failures are actionable errors without exposing provider responses', async () => {
  const input={text:'你好',language:'Mandarin Chinese'};
  await assert.rejects(createSpeechSynthesizer({env:{}})(input),error=>error.code==='CONFIGURATION' && !error.message.includes('test-key'));
  const limited=createSpeechSynthesizer({env:{AZURE_SPEECH_KEY:'test-key',AZURE_SPEECH_REGION:'eastus'},fetch:async()=>new Response('provider secret details',{status:429})});
  await assert.rejects(limited(input),error=>error.code==='RATE_LIMIT' && !error.message.includes('provider secret'));
});
