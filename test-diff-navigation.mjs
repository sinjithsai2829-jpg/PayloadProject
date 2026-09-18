import assert from 'node:assert/strict';
import {
  buildDiffLineIndex,
  nearestDiffIndexForLine,
  visibleCenterLine,
  lineFromClientY,
} from './src/diff-navigation.js';
import { nearestStructuralDiff } from './src/diff-structural-mapping.js';

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

// Clicking a line in the middle of an already scrolled editor must map the
// pointer Y position back to the document line and select the nearest diff.
const clickedLine = lineFromClientY({
  clientY: 320,
  rectTop: 100,
  scrollTop: (1001 - 1) * 20 - 200,
  lineHeight: 20,
  paddingTop: 0,
});
assert.equal(clickedLine, 1002);
assert.equal(nearestDiffIndexForLine(leftIndex, clickedLine), 249);

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

const structural = [
  { path: '$.records[0].id', type: 'modified', leftLine: 5, rightLine: 5 },
  { path: '$.records[10].name', type: 'modified', leftLine: 45, rightLine: 45 },
  { path: '$.records[20]', type: 'added', leftLine: null, rightLine: 90 },
];
assert.equal(nearestStructuralDiff(structural, { leftLine: 44, rightLine: 44 }, 0)?.path, '$.records[10].name');
assert.equal(nearestStructuralDiff(structural, { leftLine: null, rightLine: 91 }, 1)?.path, '$.records[20]');
assert.equal(nearestStructuralDiff(structural, { leftLine: 90, rightLine: null }, 0)?.path, '$.records[20]');

console.log('All diff navigation tests passed.');
