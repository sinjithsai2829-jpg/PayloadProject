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
const foldBridge = fs.readFileSync('./src/aligned-fold-bridge.js', 'utf8');
const coordinator = fs.readFileSync('./src/view-surface-coordinator.js', 'utf8');
const editableCompare = fs.readFileSync('./src/editable-compare.js', 'utf8');

assert.ok(boot.includes("import './aligned-compare-view.js'"));
assert.ok(boot.includes("import './aligned-fold-bridge.js'"));
assert.ok(ui.includes('no corresponding line'));
assert.ok(ui.includes('aligned-compare-row'));
assert.ok(ui.includes('placeholderRows'));
assert.ok(ui.includes('PayloadDiffCompareSession?.goToIndex'));
assert.ok(editableCompare.includes('goToIndex: (index) => selectAbsoluteDiff(index)'));
assert.ok(editableCompare.includes('PayloadDiffAlignedCompare?.revealDiff'));
assert.ok(editableCompare.includes('structuralDiffs'));
assert.ok(editableCompare.includes("new CustomEvent('payloaddiff:diff-selection-changed'"));
assert.ok(ui.includes("window.addEventListener('payloaddiff:diff-selection-changed'"));
assert.ok(ui.includes('function rebuildDecorations()'));
assert.ok(ui.includes("classes.push(move.role === 'from' ? 'moved-from' : 'moved-to')"));
assert.ok(coordinator.includes('aligned-compare-view'));
assert.ok(!ui.includes("mode === 'json'"));
assert.ok(!ui.includes("mode === 'xml'"));

// The same code-fold gutter is shared by JSON and XML. During aligned compare
// the bridge raises that gutter above the alignment surface; once a user
// collapses a block, the existing folded projection takes over until expanded.
assert.ok(foldBridge.includes('.aligned-compare-active:not(.folding-active) > .code-fold-gutter'));
assert.ok(foldBridge.includes('.aligned-compare-active.folding-active > .fold-code-view'));
assert.ok(foldBridge.includes('PayloadDiffCodeFolding?.refresh'));
const codeFolding = fs.readFileSync('./src/code-folding.js', 'utf8');
const revealStart = codeFolding.indexOf('function revealCurrentDifference()');
const revealEnd = codeFolding.indexOf('\nfunction diffTypesForPane', revealStart);
const revealSource = codeFolding.slice(revealStart, revealEnd);
assert.ok(revealSource.includes('scrollSurfaceToOriginalLine(index, line)'));
assert.ok(!revealSource.includes('collapsed.delete'));
assert.ok(!revealSource.includes('notifyFoldState'));

console.log('All aligned comparison tests passed.');
