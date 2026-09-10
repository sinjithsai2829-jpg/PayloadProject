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
    syncEnabled: true,
    currentDiffIndex: 7,
    codeScroll: [{ top: 120, left: 4 }, { top: 130, left: 5 }],
    treeScroll: [{ top: 10, left: 0 }, { top: 20, left: 0 }],
  },
});

assert.equal(snapshot.schema, COMPARISON_FILE_SCHEMA);
assert.equal(snapshot.version, COMPARISON_FILE_VERSION);
assert.equal(snapshot.payloads.left, left);
assert.equal(snapshot.payloads.right, right);
assert.equal(snapshot.ui.currentDiffIndex, 7);
assert.deepEqual(snapshot.ui.views, ['code', 'tree']);

const restored = parseComparisonSnapshot(serializeComparisonSnapshot(snapshot));
assert.equal(restored.payloads.left, left);
assert.equal(restored.payloads.right, right);
assert.equal(restored.mode, 'json');
assert.equal(restored.ui.currentDiffIndex, 7);
assert.deepEqual(restored.ui.codeScroll[0], { top: 120, left: 4 });

assert.throws(() => parseComparisonSnapshot('{"schema":"wrong"}'), /not a PayloadDiff comparison file/i);
assert.throws(() => parseComparisonSnapshot('{'), /Invalid PayloadDiff comparison file/i);
assert.throws(() => createComparisonSnapshot({ mode: 'json', left: '', right }), /Both payloads are required/i);

console.log('All saved comparison file tests passed.');
