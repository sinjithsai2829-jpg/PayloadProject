import assert from 'node:assert/strict';
import { compareTextPayloads, diffLineEvents } from './src/text-fallback-diff.js';

const modified = compareTextPayloads({
  mode: 'json',
  left: '{\n  "name": "Alice",\n  "broken": [1,2,\n}',
  right: '{\n  "name": "Bob",\n  "broken": [1,2,\n}',
  reason: 'invalid JSON',
});
assert.equal(modified.fallback, true);
assert.equal(modified.comparisonKind, 'text');
assert.equal(modified.mode, 'json');
assert.equal(modified.summary.modified, 1);
assert.equal(modified.diffs.length, 1);
assert.equal(modified.diffs[0].leftLine, 2);
assert.equal(modified.diffs[0].rightLine, 2);
assert.equal(modified.diffs[0].path, '$text[0]');

const inserted = compareTextPayloads({
  mode: 'xml',
  left: '<root>\n  <a>1</a>\n</root',
  right: '<root>\n  <a>1</a>\n  <b>2</b>\n</root',
  reason: 'invalid XML',
});
assert.equal(inserted.fallback, true);
assert.equal(inserted.mode, 'xml');
assert.equal(inserted.summary.added, 1);
assert.equal(inserted.diffs[0].rightLine, 3);
assert.equal(inserted.diffs[0].leftLine, null);

const removed = diffLineEvents(['a', 'gone', 'z'], ['a', 'z']);
assert.equal(removed.summary.removed, 1);
assert.equal(removed.diffs[0].leftLine, 2);
assert.equal(removed.diffs[0].rightLine, null);

const identicalInvalid = compareTextPayloads({
  mode: 'json',
  left: '{"bad": [1,}',
  right: '{"bad": [1,}',
  reason: 'invalid JSON',
});
assert.equal(identicalInvalid.identical, true);
assert.equal(identicalInvalid.diffs.length, 0);
assert.deepEqual(identicalInvalid.summary, { added: 0, removed: 0, modified: 0, truncated: false });

const crlf = compareTextPayloads({
  mode: 'xml',
  left: '<a>\r\n  <b/>\r\n</a',
  right: '<a>\n  <b/>\n</a',
  reason: 'invalid XML',
});
assert.equal(crlf.identical, true);

const capped = diffLineEvents(
  Array.from({ length: 30 }, (_, index) => `left-${index}`),
  Array.from({ length: 30 }, (_, index) => `right-${index}`),
  5,
);
assert.ok(capped.diffs.length <= 5);
assert.equal(capped.summary.truncated, true);

console.log('All text fallback comparison tests passed.');
