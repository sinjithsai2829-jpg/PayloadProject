import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_COMPARE_OPTIONS,
  normalizeCompareOptions,
  normalizeComparableText,
  annotateMovedLineDiffs,
} from './src/compare-normalization.js';
import { compareJsonValues } from './src/fast-engine.js';
import { compareFormattedXml } from './src/xml-compare.js';
import { compareTextPayloads } from './src/text-fallback-diff.js';

assert.deepEqual(normalizeCompareOptions({}), DEFAULT_COMPARE_OPTIONS);
assert.equal(normalizeComparableText('  Hello   World  ', { ignoreWhitespace: true }), 'Hello World');
assert.equal(normalizeComparableText('HELLO', { ignoreCase: true }), 'hello');

const jsonCaseStrict = compareJsonValues({ value: 'ABC' }, { value: 'abc' });
assert.equal(jsonCaseStrict.summary.modified, 1);
const jsonCaseIgnored = compareJsonValues({ value: 'ABC' }, { value: 'abc' }, undefined, { ignoreCase: true });
assert.equal(jsonCaseIgnored.summary.modified, 0);

// JSON keys remain case-sensitive: this is an API-contract difference, not a value-only case difference.
const jsonKeyCase = compareJsonValues({ UserId: 1 }, { userId: 1 }, undefined, { ignoreCase: true });
assert.equal(jsonKeyCase.summary.removed, 1);
assert.equal(jsonKeyCase.summary.added, 1);

const xmlWhitespace = compareFormattedXml(
  '<root>\n  <value>hello world</value>\n</root>',
  '<root>\n  <value>hello    world</value>\n</root>',
  { ignoreWhitespace: true },
);
assert.equal(xmlWhitespace.identical, true);

const xmlCase = compareFormattedXml(
  '<root>\n  <value>ABC</value>\n</root>',
  '<root>\n  <value>abc</value>\n</root>',
  { ignoreCase: true },
);
assert.equal(xmlCase.identical, true);

const fallback = compareTextPayloads({
  mode: 'json',
  left: '{\n  "name": "ALICE",\n}',
  right: '{\n  "name": "alice",\n}',
  reason: 'invalid JSON',
  options: { ignoreCase: true },
});
assert.equal(fallback.identical, true);

const moved = annotateMovedLineDiffs(
  [
    { type: 'removed', leftLine: 2, rightLine: null },
    { type: 'added', leftLine: null, rightLine: 4 },
  ],
  ['a', 'same-line', 'b'],
  ['a', 'b', 'c', 'same-line'],
  { detectMoves: true },
);
assert.equal(moved.movedPairs, 1);
assert.equal(moved.diffs[0].move.role, 'from');
assert.equal(moved.diffs[0].move.counterpartLine, 4);
assert.equal(moved.diffs[1].move.role, 'to');
assert.equal(moved.diffs[1].move.counterpartLine, 2);

const ambiguousMoves = annotateMovedLineDiffs(
  [
    { type: 'removed', leftLine: 2, rightLine: null },
    { type: 'removed', leftLine: 5, rightLine: null },
    { type: 'added', leftLine: null, rightLine: 3 },
    { type: 'added', leftLine: null, rightLine: 6 },
  ],
  ['a', 'repeat', 'b', 'c', 'repeat'],
  ['a', 'b', 'repeat', 'c', 'd', 'repeat'],
  { detectMoves: true },
);
assert.equal(ambiguousMoves.movedPairs, 0, 'repeated lines without a unique anchor must not be guessed as moves');

const movedBlock = annotateMovedLineDiffs(
  [
    { type: 'removed', leftLine: 2, rightLine: null },
    { type: 'removed', leftLine: 3, rightLine: null },
    { type: 'removed', leftLine: 8, rightLine: null },
    { type: 'added', leftLine: null, rightLine: 5 },
    { type: 'added', leftLine: null, rightLine: 6 },
    { type: 'added', leftLine: null, rightLine: 10 },
  ],
  ['x', 'unique-anchor', 'repeat', 'a', 'b', 'c', 'd', 'repeat'],
  ['x', 'a', 'b', 'c', 'unique-anchor', 'repeat', 'd', 'e', 'f', 'repeat'],
  { detectMoves: true },
);
assert.equal(movedBlock.movedPairs, 1);
assert.equal(movedBlock.diffs[0].move.id, movedBlock.diffs[1].move.id);
assert.equal(movedBlock.diffs[3].move.id, movedBlock.diffs[4].move.id);
assert.equal(movedBlock.diffs[0].move.id, movedBlock.diffs[3].move.id);
assert.equal(movedBlock.diffs[2].move, undefined, 'ambiguous repeated line outside the anchored block must remain unpaired');
assert.equal(movedBlock.diffs[5].move, undefined);

const noMoves = annotateMovedLineDiffs(
  [
    { type: 'removed', leftLine: 2, rightLine: null },
    { type: 'added', leftLine: null, rightLine: 4 },
  ],
  ['a', 'same-line'],
  ['a', 'b', 'c', 'same-line'],
  { detectMoves: false },
);
assert.equal(noMoves.movedPairs, 0);
assert.equal(noMoves.diffs[0].move, undefined);

const ui = fs.readFileSync('./src/compare-options-ui.js', 'utf8');
const bridge = fs.readFileSync('./src/compare-options-worker-bridge.js', 'utf8');
const visual = fs.readFileSync('./src/compare-options-enhancements.js', 'utf8');
const boot = fs.readFileSync('./src/boot.js', 'utf8');
const smooth = fs.readFileSync('./src/smooth-worker.js', 'utf8');

assert.ok(ui.includes('Detect moved lines'));
assert.ok(ui.includes('Ignore whitespace'));
assert.ok(ui.includes('Ignore case'));
assert.ok(ui.includes('Group nearby differences'));
assert.ok(ui.includes("document.addEventListener('pointerdown'"));
assert.ok(ui.includes('details.contains(event.target)'));
assert.ok(ui.includes('details.open = false'));
assert.ok(ui.includes("event.key !== 'Escape'"));
assert.ok(ui.includes('summary?.focus()'));
assert.ok(ui.includes("document.addEventListener('focusin'"));
assert.ok(ui.includes('aria-haspopup="true"'));
assert.ok(ui.includes("summary?.setAttribute('aria-expanded', String(details.open))"));
assert.ok(!ui.includes("mode === 'json'"));
assert.ok(!ui.includes("mode === 'xml'"));
assert.ok(bridge.includes("message.task === 'compare' || message.task === 'compareLive'"));
assert.ok(visual.includes('moved-from'));
assert.ok(visual.includes('moved-to'));
assert.ok(visual.includes('diff-block-start'));
assert.ok(visual.includes('diff-block-end'));
assert.ok(!visual.includes('buildAlignedRows('), 'visual decoration must reuse the persistent alignment model');
assert.ok(!visual.includes('annotateMovedLineDiffs('), 'move metadata must be computed once in the comparison engine');
assert.ok(boot.includes("import './compare-options-ui.js'"));
assert.ok(boot.includes("import './compare-options-enhancements.js'"));
assert.ok(smooth.includes('normalizeCompareOptions(payload.options || {})'));

console.log('All comparison option tests passed.');
