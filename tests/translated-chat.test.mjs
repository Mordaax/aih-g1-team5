import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslatedChat } from '../lib/translated-chat.ts';

test('source URLs survive translation unchanged and never enter the translated answer text', async () => {
  const chat = createTranslatedChat({
    run: async () => ({message:'You can ask MOM for help.\n\nSources:\n[MOM contact](https://www.mom.gov.sg/contact-us?lang=en)',outputCount:1}),
    selectLanguage: async () => { throw new Error('Unexpected onboarding'); },
    translate: async ({text,targetLanguage}) => {
      if (targetLanguage === 'English') return 'Where can I get help?';
      assert.equal(text, 'You can ask MOM for help.');
      return 'คุณสามารถขอความช่วยเหลือจาก MOM ได้';
    },
  });
  const result = await chat({message:'ขอความช่วยเหลือ',language:'Thai',sessionId:'source-test',requestId:'source-1'});
  assert.equal(result.message, 'คุณสามารถขอความช่วยเหลือจาก MOM ได้');
  assert.deepEqual(result.sources, [{title:'MOM contact',url:'https://www.mom.gov.sg/contact-us?lang=en'}]);
});

test('Thai questions reach CX in English and only Thai answers return to the website', async () => {
  const calls = [];
  const chat = createTranslatedChat({
    translate: async (input) => {
      calls.push(['translate', input]);
      return input.targetLanguage === 'English' ? 'Can I take a rest day?' : 'คุณมีสิทธิหยุดพัก';
    },
    run: async (input) => { calls.push(['cx', input]); return {message:'You are entitled to rest.', outputCount:1}; },
    selectLanguage: async () => { throw new Error('Unexpected onboarding'); },
  });
  const result = await chat({message:'ฉันหยุดได้ไหม', language:'Thai', sessionId:'session-thai', requestId:'turn-1'});
  assert.deepEqual(result, {message:'คุณมีสิทธิหยุดพัก', language:'Thai', outputCount:1});
  assert.deepEqual(calls, [
    ['translate', {text:'ฉันหยุดได้ไหม', sourceLanguage:'Thai', targetLanguage:'English'}],
    ['cx', {message:'Can I take a rest day?', language:'English', sessionId:'session-thai'}],
    ['translate', {text:'You are entitled to rest.', sourceLanguage:'English', targetLanguage:'Thai'}],
  ]);
});

test('English skips both translation calls and keeps the conversation session', async () => {
  const inputs = [];
  const chat = createTranslatedChat({
    translate: async () => { throw new Error('English must bypass translation'); },
    run: async (input) => { inputs.push(input); return {message:'Hello.', outputCount:1}; },
    selectLanguage: async () => { throw new Error('Unexpected onboarding'); },
  });
  await chat({message:'Hello', language:'English', sessionId:'same-session', requestId:'turn-1'});
  await chat({message:'And my rest day?', language:'English', sessionId:'same-session', requestId:'turn-2'});
  assert.deepEqual(inputs.map(i => i.sessionId), ['same-session','same-session']);
  assert.equal(inputs[1].language, 'English');
});

test('Mandarin onboarding selects English in CX and translates its greeting into Mandarin', async () => {
  let selection;
  const chat = createTranslatedChat({
    run: async () => { throw new Error('Use onboarding handshake'); },
    selectLanguage: async (input) => { selection=input; return {message:'How can I help?',outputCount:1}; },
    translate: async (input) => {
      assert.equal(input.sourceLanguage,'English');
      assert.equal(input.targetLanguage,'Mandarin Chinese');
      return '我能如何帮助您？';
    },
  });
  const result=await chat({message:'Mandarin Chinese',language:'Mandarin Chinese',sessionId:'same-session',requestId:'select-1',selectLanguage:true});
  assert.deepEqual(selection, {sessionId:'same-session',language:'English'});
  assert.equal(result.message,'我能如何帮助您？');
});

test('retry after output translation fails reuses the English CX answer', async () => {
  let cxCalls=0, outputTranslations=0;
  const chat=createTranslatedChat({
    run:async()=>{cxCalls++;return {message:'Salary is $600.',outputCount:1};},
    selectLanguage:async()=>{throw new Error('Unexpected onboarding');},
    translate:async ({targetLanguage})=>{
      if(targetLanguage==='English')return 'How much is my salary?';
      if(++outputTranslations===1)throw new Error('Translation quota');
      return '工资是 $600。';
    },
  });
  const input={message:'我的工资是多少？',language:'Mandarin Chinese',sessionId:'session-cn',requestId:'turn-cn'};
  await assert.rejects(chat(input), /Translation quota/);
  assert.equal((await chat(input)).message,'工资是 $600。');
  assert.equal(cxCalls,1);
});

test('failed input translation never sends the untranslated question to CX', async () => {
  let called=false;
  const chat=createTranslatedChat({
    run:async()=>{called=true;return {message:'wrong',outputCount:1};},
    selectLanguage:async()=>{throw new Error('Unexpected onboarding');},
    translate:async()=>{throw new Error('Translation unavailable');},
  });
  await assert.rejects(chat({message:'สวัสดี',language:'Thai',sessionId:'session-th',requestId:'turn-1'}),/Translation unavailable/);
  assert.equal(called,false);
});

test('reusing a request ID for different text is rejected rather than returning the wrong answer', async () => {
  const chat=createTranslatedChat({run:async()=>({message:'Hello',outputCount:1}),translate:async()=>'',selectLanguage:async()=>({message:'Hello',outputCount:1})});
  await chat({message:'Hello',language:'English',sessionId:'session-en',requestId:'turn-1'});
  await assert.rejects(chat({message:'Another question',language:'English',sessionId:'session-en',requestId:'turn-1'}),/request/i);
});

test('onboarding does not tell a Thai user that they chose English',async()=>{
  let greeting;
  const chat=createTranslatedChat({
    run:async()=>{throw new Error('Unexpected chat turn');},
    selectLanguage:async()=>({message:'We can continue in English. How can I help?',outputCount:1}),
    translate:async input=>{greeting=input.text;return 'สวัสดี มีอะไรให้ช่วยไหม';},
  });
  await chat({message:'Thai',language:'Thai',sessionId:'session-th',requestId:'select-th',selectLanguage:true});
  assert.doesNotMatch(greeting,/continue in English/);
});
