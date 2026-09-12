import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAlignedRows, changedTextRange } from './src/alignment-model.js';

const removed = buildAlignedRows(
  ['<a/>', '<b/>', '<extra/>', '<c/>', '<d/>'].join('\n'),
  ['<a/>', '<b/>', '<c/>', '<d/>'].join('\n'),
  [{ path: '$xml[0]', type: 'removed', leftLine: 3, rightLine: null }],
);
assert.equal(removed.placeholderCount, 1);
assert.deepEqual(
  removed.rows.map((row) => [row.leftLine, row.rightLine]),
  [[1, 1], [2, 2], [3, null], [4, 3], [5, 4]],
);
assert.equal(removed.rows[2].type, 'removed');
assert.deepEqual(removed.rows[2].diffIndexes, [0]);
assert.equal(removed.rowForDiff[0], 2);

const added = buildAlignedRows(
  ['a', 'b', 'c', 'd'].join('\n'),
  ['a', 'b', 'new', 'c', 'd'].join('\n'),
  [{ path: '$text[0]', type: 'added', leftLine: null, rightLine: 3 }],
);
assert.deepEqual(
  added.rows.map((row) => [row.leftLine, row.rightLine]),
  [[1, 1], [2, 2], [null, 3], [3, 4], [4, 5]],
);
assert.equal(added.rows[2].type, 'added');

const twoGaps = buildAlignedRows(
  ['one', 'left-only', 'two', 'three'].join('\n'),
  ['one', 'two', 'right-only', 'three'].join('\n'),
  [
    { type: 'removed', leftLine: 2, rightLine: null },
    { type: 'added', leftLine: null, rightLine: 3 },
  ],
);
assert.deepEqual(
  twoGaps.rows.map((row) => [row.leftLine, row.rightLine]),
  [[1, 1], [2, null], [3, 2], [null, 3], [4, 4]],
);

const modified = buildAlignedRows(
  ['one', 'left-value', 'three'].join('\n'),
  ['one', 'right-value', 'three'].join('\n'),
  [{ type: 'modified', leftLine: 2, rightLine: 2 }],
);
assert.equal(modified.placeholderCount, 0);
assert.equal(modified.rows[1].type, 'modified');
assert.equal(modified.rowForDiff[0], 1);

const range = changedTextRange('value="CDCP"', 'value="CMAIN"');
assert.ok(range.leftEnd > range.leftStart);
assert.ok(range.rightEnd > range.rightStart);
assert.equal('value="CDCP"'.slice(0, range.leftStart), 'value="C');

const boot = fs.readFileSync('./src/boot.js', 'utf8');
const ui = fs.readFileSync('./src/aligned-compare-view.js', 'utf8');
const coordinator = fs.readFileSync('./src/view-surface-coordinator.js', 'utf8');
const editableCompare = fs.readFileSync('./src/editable-compare.js', 'utf8');

assert.ok(boot.includes("import './aligned-compare-view.js'"));
assert.ok(ui.includes('no corresponding line'));
assert.ok(ui.includes('aligned-compare-row'));
assert.ok(ui.includes('placeholderRows'));
assert.ok(ui.includes('PayloadDiffCompareSession?.goToIndex'));
assert.ok(editableCompare.includes('goToIndex: (index) => selectAbsoluteDiff(index)'));
assert.ok(editableCompare.includes('PayloadDiffAlignedCompare?.revealDiff'));
assert.ok(coordinator.includes('aligned-compare-view'));
assert.ok(!ui.includes("mode === 'json'"));
assert.ok(!ui.includes("mode === 'xml'"));

console.log('All aligned comparison tests passed.');
