import assert from 'node:assert/strict';
import { diffLines, HISTOGRAM_THRESHOLD_LINES } from './src/line-diff.js';
import { findHistogramDifferenceRegions } from './src/histogram-diff.js';
import { compareFormattedCode } from './src/formatted-code-compare.js';

const simple = diffLines(['a', 'old', 'c'], ['a', 'new', 'c']);
assert.deepEqual(simple.summary, { added: 0, removed: 0, modified: 1, truncated: false });
assert.equal(simple.diffs[0].leftLine, 2);
assert.equal(simple.diffs[0].rightLine, 2);

const inserted = diffLines(['a', 'b', 'c'], ['a', 'x', 'b', 'c']);
assert.equal(inserted.summary.added, 1);
assert.equal(inserted.diffs[0].rightLine, 2);

const blockSize = Math.max(300, HISTOGRAM_THRESHOLD_LINES);
const a = Array.from({ length: blockSize }, (_, index) => `A-${index}`);
const b = Array.from({ length: blockSize }, (_, index) => `B-${index}`);
const left = [...a, ...b];
const right = [...b, ...a];

const regions = findHistogramDifferenceRegions(left, right);
assert.ok(regions.length >= 2, 'Histogram anchors should split a large reordered document into unmatched regions');

const moved = diffLines(left, right);
assert.equal(moved.summary.modified, 0);
assert.equal(moved.summary.removed, blockSize);
assert.equal(moved.summary.added, blockSize);
assert.equal(moved.summary.truncated, false);

for (const mode of ['json', 'xml']) {
  const compared = compareFormattedCode(mode, left.join('\n'), right.join('\n'));
  assert.equal(compared.summary.removed, blockSize, `${mode} removed block`);
  assert.equal(compared.summary.added, blockSize, `${mode} added block`);
  assert.equal(compared.summary.modified, 0, `${mode} should preserve stable Histogram anchors`);
  assert.equal(compared.movedPairs, 1, `${mode} should recognize the reordered block as one move`);
}

console.log('All shared Histogram + Myers JSON/XML comparison tests passed.');
