import test from 'node:test';
import assert from 'node:assert/strict';
import { updateTranscript } from '../lib/streaming-transcript.ts';

test('interim hypotheses replace one another and final segments append only once', () => {
  let state = {final: '', interim: ''};
  state = updateTranscript(state, {type:'interim',text:'Hello'});
  state = updateTranscript(state, {type:'interim',text:'Hello there'});
  assert.equal(state.interim, 'Hello there');
  assert.equal(state.final, '');
  state = updateTranscript(state, {type:'final',text:'Hello there.'});
  assert.deepEqual(state, {final:'Hello there.',interim:''});
  state = updateTranscript(state, {type:'final',text:'How are you?'});
  assert.equal(state.final, 'Hello there. How are you?');
});
test('empty and unrelated messages cannot erase a committed transcript', () => {
  const state = {final:'Hello.',interim:'there'};
  assert.deepEqual(updateTranscript(state, {type:'done'}), state);
  assert.deepEqual(updateTranscript(state, {type:'final',text:''}), state);
});
