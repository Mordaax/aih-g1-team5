import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAnswerSources, normalizeSources } from '../lib/answer-sources.ts';

test('moves Markdown and bare source URLs below the answer without losing advice or phone numbers', () => {
  const result = extractAnswerSources('Call 6438 5122 for help. Read [MOM guidance](https://www.mom.gov.sg/help).\n\nSources:\n- [MOM guidance](https://www.mom.gov.sg/help)\n- https://www.home.org.sg/contact-us.');
  assert.equal(result.text, 'Call 6438 5122 for help. Read MOM guidance.');
  assert.deepEqual(result.sources, [
    { title: 'MOM guidance', url: 'https://www.mom.gov.sg/help' },
    { title: 'home.org.sg', url: 'https://www.home.org.sg/contact-us' },
  ]);
});

test('keeps balanced parentheses and query strings in URLs, excluding surrounding punctuation', () => {
  const result = extractAnswerSources('See https://example.org/guide_(workers)?lang=en&v=2.\n\nStay safe.');
  assert.equal(result.sources[0].url, 'https://example.org/guide_(workers)?lang=en&v=2');
  assert.match(result.text, /Stay safe/);
  const markdown = extractAnswerSources('[Guide](https://example.org/guide_(workers))');
  assert.equal(markdown.sources[0].url, 'https://example.org/guide_(workers)');
});

test('only allows web links from source metadata and deduplicates equivalent URLs', () => {
  assert.deepEqual(normalizeSources([
    {title:'Bad',url:'javascript:alert(1)'}, {title:'Data',url:'data:text/html,bad'},
    {title:'Credentials',url:'https://user:password@example.org/'},
    {title:'MOM',url:'https://www.mom.gov.sg/'}, {title:'Duplicate',url:'https://www.mom.gov.sg/'},
    null, {title:4,url:'https://example.org'},
  ]), [{title:'MOM',url:'https://www.mom.gov.sg/'}]);
  assert.deepEqual(extractAnswerSources('Hello. How can I help?'), {text:'Hello. How can I help?',sources:[]});
});

test('Markdown emphasis around a bare URL cannot become part of the destination', () => {
  const result = extractAnswerSources('Sources:\n**https://www.mom.gov.sg/help**\n`https://www.home.org.sg/`');
  assert.deepEqual(result.sources.map(source => source.url), ['https://www.mom.gov.sg/help','https://www.home.org.sg/']);
});
