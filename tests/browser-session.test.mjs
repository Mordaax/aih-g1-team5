import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserSession, saveBrowserSession, clearBrowserSession } from '../lib/browser-session.ts';

const now = 1_800_000_000_000;
const session = {
  sessionId: 'test-session-123', language: 'Tagalog',
  messages: [{ id: 'u1', role: 'user', content: 'Kumusta' }, { id: 'a1', role: 'assistant', content: 'Hello' }],
  draft: 'Unsent question', reviewTranscript: true,
};
function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}
test('refresh restores the same CX session, language, messages, and reviewed draft', () => {
  const browser = storage();
  assert.equal(saveBrowserSession(browser, session, now), true);
  assert.deepEqual(loadBrowserSession(browser, now + 60_000), session);
});

test('source links remain attached to their answer after refreshing', () => {
  const browser = storage();
  const saved = {...session,messages:[{id:'answer',role:'assistant',content:'Ask MOM for help.',sources:[{title:'MOM',url:'https://www.mom.gov.sg/contact-us'}]}]};
  saveBrowserSession(browser,saved,now);
  assert.deepEqual(loadBrowserSession(browser,now+1000).messages,saved.messages);
});
test('expired conversations are removed rather than restored', () => {
  const browser = storage();
  saveBrowserSession(browser, session, now);
  assert.equal(loadBrowserSession(browser, now + 24 * 60 * 60 * 1000), null);
  assert.equal(browser.values.size, 0);
});
test('a confirmed language survives refresh even before the first question', () => {
  const browser = storage();
  saveBrowserSession(browser, { ...session, messages: [], languageConfirmed: true }, now);
  assert.equal(loadBrowserSession(browser, now + 1000).languageConfirmed, true);
});
test('clear chat removes the saved conversation without clearing other browser data', () => {
  const browser = storage();
  browser.setItem('unrelated', 'keep');
  saveBrowserSession(browser, session, now);
  assert.equal(clearBrowserSession(browser), true);
  assert.equal(loadBrowserSession(browser, now), null);
  assert.equal(browser.getItem('unrelated'), 'keep');
});
test('corrupt storage cannot crash chat initialization', () => {
  const browser = storage();
  saveBrowserSession(browser, session, now);
  const key = [...browser.values.keys()][0];
  browser.setItem(key, '{broken');
  assert.equal(loadBrowserSession(browser, now), null);
});
test('invalid message roles and unsupported saved schemas are discarded', () => {
  for (const mutate of [(record) => { record.messages[0].role = 'system'; }, (record) => { record.version = 99; }]) {
    const browser = storage();
    saveBrowserSession(browser, session, now);
    const key = [...browser.values.keys()][0];
    const record = JSON.parse(browser.getItem(key));
    mutate(record);
    browser.setItem(key, JSON.stringify(record));
    assert.equal(loadBrowserSession(browser, now), null);
  }
});
test('blocked or full browser storage leaves in-memory chat usable', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } };
  assert.equal(loadBrowserSession(blocked, now), null);
  assert.equal(saveBrowserSession(blocked, session, now), false);
  assert.equal(clearBrowserSession(blocked), false);
});

test('per-answer language survives refresh and malformed language metadata is discarded', () => {
  const browser=storage();
  const saved={...session,messages:[{id:'a-th',role:'assistant',content:'สวัสดี',language:'Thai'}]};
  saveBrowserSession(browser,saved,now);
  assert.equal(loadBrowserSession(browser,now+1000).messages[0].language,'Thai');
  const key=[...browser.values.keys()][0];
  const corrupt=JSON.parse(browser.getItem(key));
  corrupt.messages[0].language={name:'Thai'};
  browser.setItem(key,JSON.stringify(corrupt));
  assert.equal(loadBrowserSession(browser,now+1000),null);
});
