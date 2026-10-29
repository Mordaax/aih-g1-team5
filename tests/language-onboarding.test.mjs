import test from 'node:test';
import assert from 'node:assert/strict';
import { needsLanguageSelection, selectCxLanguage } from '../lib/language-onboarding.ts';

test('new visits and unconfirmed saved prompts ask for language; returning conversations resume', () => {
  assert.equal(needsLanguageSelection(null), true);
  assert.equal(needsLanguageSelection({ messages: [{ role: 'assistant' }] }), true);
  assert.equal(needsLanguageSelection({ languageConfirmed: true, messages: [] }), false);
  assert.equal(needsLanguageSelection({ messages: [{ role: 'user' }] }), false);
});
test('CX language-menu handshake reuses the same session and forwards the chosen language', async () => {
  const inputs = [];
  const run = async (input) => {
    inputs.push(input);
    return {message: inputs.length === 1 ? 'Which language are you most comfortable using?\n1. English\n2. Tagalog / Filipino\n3. Bahasa Indonesia' : 'Kumusta! Paano kita matutulungan?', outputCount: 1};
  };
  const result = await selectCxLanguage(run, {sessionId: 'session-123', language: 'Tagalog'});
  assert.equal(result.message, 'Kumusta! Paano kita matutulungan?');
  assert.deepEqual(inputs, [{sessionId:'session-123',language:'Tagalog',message:'Tagalog'}, {sessionId:'session-123',language:'Tagalog',message:'Tagalog'}]);
});
test('a normal CX confirmation is returned without sending a duplicate language choice', async () => {
  let calls = 0;
  const result = await selectCxLanguage(async () => { calls++; return {message:'Hello. How can I help?',outputCount:1}; }, {sessionId:'session-123',language:'English'});
  assert.equal(calls, 1);
  assert.equal(result.message, 'Hello. How can I help?');
});
