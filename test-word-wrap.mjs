import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createComparisonSnapshot, parseComparisonSnapshot, serializeComparisonSnapshot } from './src/comparison-file.js';

const wrapSource = await fs.readFile(new URL('./src/word-wrap.js', import.meta.url), 'utf8');
const surfaceSource = await fs.readFile(new URL('./src/editable-code-surface.js', import.meta.url), 'utf8');
const foldingSource = await fs.readFile(new URL('./src/code-folding.js', import.meta.url), 'utf8');
const bootSource = await fs.readFile(new URL('./src/boot.js', import.meta.url), 'utf8');

assert.ok(bootSource.includes("import './word-wrap.js'"));
assert.ok(wrapSource.includes("button.textContent = 'Wrap'"));
assert.ok(wrapSource.includes("editor.wrap = next ? 'soft' : 'off'"));
assert.ok(wrapSource.includes('word-wrap-enabled'));
assert.ok(wrapSource.includes('overflow-x: hidden'));
assert.ok(wrapSource.includes('getLineMetrics'));
assert.ok(wrapSource.includes('getTextMetrics'));
assert.ok(wrapSource.includes('getVisibleLineRange'));
assert.ok(wrapSource.includes('scrollTopForLine'));
assert.ok(wrapSource.includes('wrap-diff-layer'));
assert.ok(wrapSource.includes('wrap-syntax-layer'));
assert.ok(wrapSource.includes('.word-wrap-active .editor-diff-overlay'));
assert.ok(wrapSource.includes('.word-wrap-active .inline-diff-layer'));
assert.ok(wrapSource.includes('.word-wrap-active .syntax-line-layer'));
assert.ok(!wrapSource.includes('.word-wrap-active .code-fold-gutter,'), 'Wrap mode must not hide folding controls');
assert.ok(wrapSource.includes('.word-wrap-active .fold-code-row'));
assert.ok(wrapSource.includes('.word-wrap-active .fold-row-text'));
assert.ok(wrapSource.includes("sessionStorage.setItem(STORAGE_KEY"));
assert.ok(wrapSource.includes("sessionStorage.getItem(STORAGE_KEY"));
assert.ok(!wrapSource.includes("mode === 'json'"));
assert.ok(!wrapSource.includes("mode === 'xml'"));

assert.ok(surfaceSource.includes('PayloadDiffWordWrap?.getLineMetrics'));
assert.ok(surfaceSource.includes('PayloadDiffWordWrap?.getVisibleLineRange'));
assert.ok(surfaceSource.includes("payloaddiff:word-wrap-layout"));

// Folding must share the same visual-row geometry as line numbers/diffs while
// Wrap is active instead of assuming one fixed-height row per logical line.
// Format-specific structure detection is delegated to findFoldRanges for both
// JSON and XML; the wrap geometry itself remains format-agnostic.
assert.ok(foldingSource.includes('wrapApi.getVisibleLineRange'));
assert.ok(foldingSource.includes('wrapApi.getLineMetrics'));
assert.ok(foldingSource.includes('wrapApi.getTextMetrics'));
assert.ok(foldingSource.includes("'payloaddiff:word-wrap-changed'"));
assert.ok(foldingSource.includes("'payloaddiff:word-wrap-layout'"));
assert.ok(foldingSource.includes('rowTops'));
assert.ok(foldingSource.includes('rowHeights'));
assert.ok(foldingSource.includes('ensureProjectionLayout'));
assert.ok(foldingSource.includes('findFoldRanges(currentMode(), editor.value)'));
assert.ok(foldingSource.includes("range.kind === 'element'"));

for (const mode of ['json', 'xml']) {
  const snapshot = createComparisonSnapshot({
    mode,
    left: mode === 'json' ? '{"a":1}' : '<root><a>1</a></root>',
    right: mode === 'json' ? '{"a":2}' : '<root><a>2</a></root>',
    ui: { wordWrap: [true, false] },
    comparison: {
      diffs: [{ type: 'modified', leftLine: 1, rightLine: 1 }],
      summary: { added: 0, removed: 0, modified: 1 },
    },
  });
  assert.deepEqual(snapshot.ui.wordWrap, [true, false]);
  const roundTrip = parseComparisonSnapshot(serializeComparisonSnapshot(snapshot));
  assert.deepEqual(roundTrip.ui.wordWrap, [true, false]);
}

const oldSnapshot = createComparisonSnapshot({
  mode: 'json',
  left: '{"a":1}',
  right: '{"a":1}',
  ui: {},
});
assert.deepEqual(oldSnapshot.ui.wordWrap, [false, false]);

console.log('All word wrap tests passed.');
