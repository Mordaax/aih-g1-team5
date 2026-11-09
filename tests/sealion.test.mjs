import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../lib/sealion.ts';

test('SEA-LION receives translation instructions and untrusted source text as data', async () => {
  let request;
  const translate=createTranslator({env:{SEALION_API_KEY:'test-key',SEALION_MODEL:'test-model'},fetch:async(url,options)=>{
    request={url,options,body:JSON.parse(options.body)};
    return Response.json({id:'completion-1',object:'chat.completion',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'เงินเดือน $600 โทร 999'}}]});
  }});
  const result=await translate({text:'Salary $600. Call 999.',sourceLanguage:'English',targetLanguage:'Thai'});
  assert.equal(result,'เงินเดือน $600 โทร 999');
  assert.equal(request.url,'https://api.sea-lion.ai/v1/chat/completions');
  assert.equal(request.options.headers.Authorization,'Bearer test-key');
  assert.equal(request.body.model,'test-model');
  assert.equal(request.body.messages[0].role,'system');
  assert.match(request.body.messages[0].content,/translate/i);
  assert.deepEqual(JSON.parse(request.body.messages[1].content),{sourceLanguage:'English',targetLanguage:'Thai',text:'Salary $600. Call 999.'});
  assert.equal(request.options.cache,'no-store');
});

test('translation that changes salary amounts or emergency numbers is rejected', async () => {
  const translate=createTranslator({env:{SEALION_API_KEY:'test-key'},fetch:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'工资 $60，拨打 911。'}}]})});
  await assert.rejects(translate({text:'Salary $600. Call 999.',sourceLanguage:'English',targetLanguage:'Mandarin Chinese'}),error=>error.code==='INVALID_RESPONSE');
});

test('missing translation credentials fail before making a network request', async () => {
  const translate=createTranslator({env:{},fetch:async()=>{throw new Error('Must not fetch');}});
  await assert.rejects(translate({text:'สวัสดี',sourceLanguage:'Thai',targetLanguage:'English'}),error=>error.code==='CONFIGURATION');
});

test('quota and truncated responses do not become displayed answers', async () => {
  const input={text:'Hello',sourceLanguage:'English',targetLanguage:'Thai'};
  const limited=createTranslator({env:{SEALION_API_KEY:'test-key'},fetch:async()=>new Response('',{status:429})});
  await assert.rejects(limited(input),error=>error.code==='RATE_LIMIT');
  const truncated=createTranslator({env:{SEALION_API_KEY:'test-key'},fetch:async()=>Response.json({choices:[{finish_reason:'length',message:{content:'สวัสดี'}}]})});
  await assert.rejects(truncated(input),error=>error.code==='INVALID_RESPONSE');
});
