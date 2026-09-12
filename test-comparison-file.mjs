import assert from 'node:assert/strict';
import {
  COMPARISON_FILE_SCHEMA,
  COMPARISON_FILE_VERSION,
  createComparisonSnapshot,
  serializeComparisonSnapshot,
  parseComparisonSnapshot,
} from './src/comparison-file.js';

const left = '{\n  "a": 1,\n  "b": true\n}';
const right = '{\n  "a": 2,\n  "b": true\n}';

const snapshot = createComparisonSnapshot({
  mode: 'json',
  left,
  right,
  ui: {
    views: ['code', 'tree'],
    theme: 'light',
    panelNames: ['Production response', 'QA response'],
    syncEnabled: true,
    currentDiffIndex: 7,
    codeScroll: [{ top: 120, left: 4 }, { top: 130, left: 5 }],
    treeScroll: [{ top: 10, left: 0 }, { top: 20, left: 0 }],
  },
  comparison: {
    mode: 'json',
    comparisonKind: 'structural',
    diffs: [
      { path: '$.a', type: 'modified', leftLine: 2, rightLine: 2 },
      { path: '$.c', type: 'added', leftLine: null, rightLine: 4 },
    ],
    summary: { added: 1, removed: 0, modified: 1, truncated: false },
    identical: false,
    elapsedMs: 4,
  },
});

assert.equal(snapshot.schema, COMPARISON_FILE_SCHEMA);
assert.equal(snapshot.version, COMPARISON_FILE_VERSION);
assert.equal(snapshot.payloads.left, left);
assert.equal(snapshot.payloads.right, right);
assert.equal(snapshot.ui.currentDiffIndex, 7);
assert.equal(snapshot.ui.theme, 'light');
assert.deepEqual(snapshot.ui.views, ['code', 'tree']);
assert.deepEqual(snapshot.ui.panelNames, ['Production response', 'QA response']);
assert.equal(snapshot.comparison.comparisonKind, 'structural');
assert.equal(snapshot.comparison.diffs.length, 2);
assert.deepEqual(snapshot.comparison.summary, { added: 1, removed: 0, modified: 1, truncated: false });

const restored = parseComparisonSnapshot(serializeComparisonSnapshot(snapshot));
assert.equal(restored.payloads.left, left);
assert.equal(restored.payloads.right, right);
assert.equal(restored.mode, 'json');
assert.equal(restored.ui.currentDiffIndex, 7);
assert.equal(restored.ui.theme, 'light');
assert.deepEqual(restored.ui.codeScroll[0], { top: 120, left: 4 });
assert.deepEqual(restored.ui.panelNames, ['Production response', 'QA response']);
assert.equal(restored.comparison.diffs[0].path, '$.a');
assert.equal(restored.comparison.diffs[0].type, 'modified');
assert.equal(restored.comparison.diffs[1].type, 'added');

const textFallback = createComparisonSnapshot({
  mode: 'xml',
  left: '<a>',
  right: '<b>',
  comparison: {
    comparisonKind: 'text',
    fallback: true,
    fallbackReason: 'invalid XML',
    diffs: [{ path: '$text[0]', type: 'modified', leftLine: 1, rightLine: 1 }],
    summary: { added: 0, removed: 0, modified: 1 },
  },
});
assert.equal(textFallback.comparison.comparisonKind, 'text');
assert.equal(textFallback.comparison.fallback, true);
assert.equal(textFallback.comparison.diffs[0].path, '$text[0]');

const defaults = createComparisonSnapshot({ mode: 'xml', left: '<a/>', right: '<b/>', ui: { panelNames: ['', '   '] } });
assert.deepEqual(defaults.ui.panelNames, ['File 1', 'File 2']);
assert.equal(defaults.ui.theme, 'dark');
assert.equal(defaults.comparison, null);

assert.throws(() => parseComparisonSnapshot('{"schema":"wrong"}'), /not a PayloadDiff comparison file/i);
assert.throws(() => parseComparisonSnapshot('{'), /Invalid PayloadDiff comparison file/i);
assert.throws(() => createComparisonSnapshot({ mode: 'json', left: '', right }), /Both payloads are required/i);

console.log('All saved comparison file tests passed.');
