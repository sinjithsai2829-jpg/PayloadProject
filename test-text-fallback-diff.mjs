import assert from 'node:assert/strict';
import { compareTextPayloads, diffLineEvents } from './src/text-fallback-diff.js';
import { compareFormattedXml } from './src/xml-compare.js';

const jsonFallback = compareTextPayloads({
  mode: 'json',
  left: '{"a":1,"broken":[1,2,}',
  right: '{"a":2,"broken":[1,2,}',
  reason: 'invalid JSON',
});
assert.equal(jsonFallback.comparisonKind, 'text-fallback');
assert.equal(jsonFallback.identical, false);
assert.ok(jsonFallback.diffs.length > 0);
assert.ok(jsonFallback.diffs.every((diff) => diff.leftLine || diff.rightLine));
assert.equal(jsonFallback.summary.added + jsonFallback.summary.removed + jsonFallback.summary.modified, jsonFallback.diffs.length);

const xmlFallback = compareTextPayloads({
  mode: 'xml',
  left: '<root>\n  <name>Old</name>\n  <broken>\n</root>',
  right: '<root>\n  <name>New</name>\n  <broken>\n</root>',
  reason: 'invalid XML',
});
assert.equal(xmlFallback.comparisonKind, 'text-fallback');
assert.equal(xmlFallback.identical, false);
assert.ok(xmlFallback.diffs.some((diff) => diff.type === 'modified'));

const insertion = compareTextPayloads({
  mode: 'json',
  left: '{\n  "a": 1,\n  "c": 3\n}',
  right: '{\n  "a": 1,\n  "b": 2,\n  "c": 3\n}',
  reason: 'line insertion',
});
assert.ok(insertion.diffs.some((diff) => diff.type === 'added' && diff.rightLine === 3));

const removal = compareTextPayloads({
  mode: 'xml',
  left: '<root>\n  <a/>\n  <b/>\n</root>',
  right: '<root>\n  <b/>\n</root>',
  reason: 'line removal',
});
assert.ok(removal.diffs.some((diff) => diff.type === 'removed' && diff.leftLine === 2));

// Regression: the Myers trace used to be captured one edit-distance layer too
// early, shifting a replacement on line 7 to line 6 in both fallback and
// structural XML comparison.
const lineSevenLeft = [
  '<root>',
  '  <a>1</a>',
  '  <b>2</b>',
  '  <c>3</c>',
  '  <d>4</d>',
  '  <e>5</e>',
  '  <target>OLD</target>',
  '  <f>6</f>',
  '</root>',
].join('\n');
const lineSevenRight = lineSevenLeft.replace('<target>OLD</target>', '<target>NEW</target>');

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
assert.deepEqual(identicalInvalid.summary, { added: 0, removed: 0, modified: 0, truncated: false, moved: 0 });

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

console.log('All text fallback diff tests passed.');
