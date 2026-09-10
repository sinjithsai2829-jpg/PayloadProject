import assert from 'node:assert/strict';
import {
  buildDiffLineIndex,
  nearestDiffIndexForLine,
  visibleCenterLine,
} from './src/diff-navigation.js';

const diffs = Array.from({ length: 534 }, (_, index) => ({
  path: `$.records[${index}]`,
  type: 'modified',
  leftLine: 5 + index * 4,
  rightLine: 5 + index * 4,
}));

const leftIndex = buildDiffLineIndex(diffs, 0);
assert.equal(leftIndex.length, 534);
assert.equal(nearestDiffIndexForLine(leftIndex, 5), 0);
assert.equal(nearestDiffIndexForLine(leftIndex, 1001), 249);
assert.equal(nearestDiffIndexForLine(leftIndex, 1005), 250);
assert.equal(nearestDiffIndexForLine(leftIndex, 2137), 533);

const centerLine = visibleCenterLine({
  scrollTop: (1001 - 1) * 20 - 250,
  clientHeight: 500,
  lineHeight: 20,
  paddingTop: 0,
});
assert.equal(centerLine, 1001);
assert.equal(nearestDiffIndexForLine(leftIndex, centerLine), 249);

// After manual scrolling near the 250th difference (zero-based index 249),
// Next must advance from that visible difference rather than from stale index 0.
let currentDiffIndex = nearestDiffIndexForLine(leftIndex, centerLine);
currentDiffIndex = (currentDiffIndex + 1 + diffs.length) % diffs.length;
assert.equal(currentDiffIndex, 250);

// Added/removed differences can have a line only on one side; the fallback line
// still allows the navigator to stay approximately aligned between both panes.
const oneSided = [
  { path: '$.a', type: 'removed', leftLine: 10, rightLine: null },
  { path: '$.b', type: 'added', leftLine: null, rightLine: 20 },
];
assert.deepEqual(buildDiffLineIndex(oneSided, 0), [
  { line: 10, index: 0 },
  { line: 20, index: 1 },
]);
assert.deepEqual(buildDiffLineIndex(oneSided, 1), [
  { line: 10, index: 0 },
  { line: 20, index: 1 },
]);

console.log('All diff navigation tests passed.');
