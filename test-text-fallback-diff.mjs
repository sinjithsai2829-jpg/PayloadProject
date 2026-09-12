import assert from 'node:assert/strict';
import { compareTextPayloads, diffLineEvents } from './src/text-fallback-diff.js';
import { compareFormattedXml } from './src/xml-compare.js';

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

// Regression: Myers trace used to be captured before each d-layer. A change on
// line 7 was consequently reported/highlighted on line 6. This is the exact
// failure observed with the large XML airport payload.
const lineSevenLeft = [
  '<one/>',
  '<two/>',
  '<three/>',
  '<four/>',
  '<five/>',
  '<six/>',
  '<airport city="LAX" code="LAX"/>',
  '<eight/>',
].join('\n');
const lineSevenRight = [
  '<one/>',
  '<two/>',
  '<three/>',
  '<four/>',
  '<five/>',
  '<six/>',
  '<airport city="LAX" code="LAXg"/>',
  '<eight/>',
].join('\n');

const fallbackLineSeven = compareTextPayloads({
  mode: 'xml',
  left: lineSevenLeft,
  right: lineSevenRight,
  reason: 'test fallback line mapping',
});
assert.equal(fallbackLineSeven.diffs.length, 1);
assert.equal(fallbackLineSeven.diffs[0].leftLine, 7);
assert.equal(fallbackLineSeven.diffs[0].rightLine, 7);

const structuralLineSeven = compareFormattedXml(lineSevenLeft, lineSevenRight);
assert.equal(structuralLineSeven.diffs.length, 1);
assert.equal(structuralLineSeven.diffs[0].type, 'modified');
assert.equal(structuralLineSeven.diffs[0].leftLine, 7);
assert.equal(structuralLineSeven.diffs[0].rightLine, 7);

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

console.log('All text fallback and exact line-mapping comparison tests passed.');
