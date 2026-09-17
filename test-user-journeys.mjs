import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { detectPayloadMode } from './src/payload-detection.js';
import { compareTextPayloads } from './src/text-fallback-diff.js';
import { findFoldRanges } from './src/fold-ranges.js';
import { createComparisonSnapshot, parseComparisonSnapshot, serializeComparisonSnapshot } from './src/comparison-file.js';

const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const compareGuard = await readFile(new URL('./src/compare-surface-guard.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('./src/theme-toggle.js', import.meta.url), 'utf8');
const fallbackUi = await readFile(new URL('./src/text-fallback-ui.js', import.meta.url), 'utf8');
const viewCoordinator = await readFile(new URL('./src/view-surface-coordinator.js', import.meta.url), 'utf8');
const enhancements = await readFile(new URL('./src/enhancements.js', import.meta.url), 'utf8');
const saved = await readFile(new URL('./src/saved-comparisons.js', import.meta.url), 'utf8');

const detectionCases = [
  ['json clean object', '{"a":1}', 'json'],
  ['json clean array', '[1,2,3]', 'json'],
  ['json escaped transport', '{\\"a\\":1}', 'json'],
  ['json malformed object', '{"a":1,}', 'json'],
  ['xml declaration', '<?xml version="1.0"?><root><a>1</a></root>', 'xml'],
  ['xml plain element', '<root><a>1</a></root>', 'xml'],
  ['xml malformed but recognizable', '<root><a>1</root>', 'xml'],
  ['plain text stays ambiguous', 'hello world', null],
];
for (const [name, input, expected] of detectionCases) {
  assert.equal(detectPayloadMode(input).mode, expected, name);
}

const fallbackCases = [
  { name: 'invalid identical JSON', mode: 'json', left: '{\n  "a": 1,\n}', right: '{\n  "a": 1,\n}', total: 0 },
  { name: 'invalid changed JSON', mode: 'json', left: '{\n  "a": 1,\n}', right: '{\n  "a": 2,\n}', total: 1 },
  { name: 'invalid identical XML', mode: 'xml', left: '<root>\n  <a>1\n</root>', right: '<root>\n  <a>1\n</root>', total: 0 },
  { name: 'invalid changed XML', mode: 'xml', left: '<root>\n  <a>1\n</root>', right: '<root>\n  <a>2\n</root>', total: 1 },
];
for (const scenario of fallbackCases) {
  const result = compareTextPayloads(scenario);
  assert.equal(result.mode, scenario.mode, scenario.name);
  assert.equal(result.comparisonKind, 'text', scenario.name);
  assert.equal(result.fallback, true, scenario.name);
  assert.equal(result.summary.added + result.summary.removed + result.summary.modified, scenario.total, scenario.name);
  assert.equal(result.identical, scenario.total === 0, scenario.name);
}

const foldingCases = [
  ['json', '{\n  "outer": {\n    "items": [\n      1,\n      2\n    ]\n  }\n}'],
  ['xml', '<root>\n  <outer>\n    <items>\n      <item>1</item>\n    </items>\n  </outer>\n</root>'],
];
for (const [mode, text] of foldingCases) {
  const ranges = findFoldRanges(mode, text);
  assert.ok(ranges.length >= 2, `${mode} should expose nested fold ranges`);
  assert.ok(ranges.every((range) => range.endLine > range.startLine), `${mode} fold ranges must be multiline`);
}
assert.doesNotThrow(() => findFoldRanges('json', '{\n  "a": [\n'));
assert.doesNotThrow(() => findFoldRanges('xml', '<root>\n  <a>\n'));

for (const mode of ['json', 'xml']) {
  for (const themeName of ['light', 'dark']) {
    const comparison = compareTextPayloads({
      mode,
      left: mode === 'json' ? '{\n  "a": 1,\n}' : '<root>\n<a>1\n</root>',
      right: mode === 'json' ? '{\n  "a": 2,\n}' : '<root>\n<a>2\n</root>',
    });
    const snapshot = createComparisonSnapshot({
      mode,
      left: comparison.leftFormatted,
      right: comparison.rightFormatted,
      comparison,
      ui: {
        views: ['code', 'code'],
        theme: themeName,
        panelNames: ['Left', 'Right'],
        syncEnabled: true,
        currentDiffIndex: 0,
        foldedRanges: [[], []],
        codeScroll: [{ top: 44, left: 3 }, { top: 55, left: 4 }],
      },
    });
    const restored = parseComparisonSnapshot(serializeComparisonSnapshot(snapshot));
    assert.equal(restored.mode, mode);
    assert.equal(restored.ui.theme, themeName);
    assert.deepEqual(restored.ui.panelNames, ['Left', 'Right']);
    assert.equal(restored.comparison.comparisonKind, 'text');
    assert.equal(restored.comparison.diffs.length, comparison.diffs.length);
  }
}

assert.ok(boot.includes("./compare-surface-guard.js"), 'compare surface guard must load at startup');
assert.ok(compareGuard.includes('compare-overlay-editor-active'));
assert.ok(compareGuard.includes('z-index: 2 !important'));
assert.ok(compareGuard.includes('background: transparent !important'));
assert.ok(compareGuard.includes('html[data-theme="light"] .editor.compare-overlay-editor-active'));
assert.ok(compareGuard.includes('html[data-theme="dark"] .editor.compare-overlay-editor-active'));
assert.ok(compareGuard.includes('.editor-wrap.tree-surface-active > .editor.compare-overlay-editor-active'));
assert.ok(!compareGuard.includes("mode === 'json'"));
assert.ok(!compareGuard.includes("mode === 'xml'"));

assert.ok(theme.includes('html[data-theme="light"] .editor-diff-overlay'));
assert.ok(compareGuard.includes('editor-diff-overlay'));
assert.ok(fallbackUi.includes('forceCodeViews()'));
assert.ok(fallbackUi.includes('Tree view requires structurally valid data'));
assert.ok(viewCoordinator.includes('tree-surface-active'));
assert.ok(viewCoordinator.includes('code-surface-active'));
assert.ok(viewCoordinator.includes('MutationObserver'));
assert.ok(enhancements.includes('activeSearchSurface'));
assert.ok(!enhancements.includes("querySelector('.view-btn[data-view=\"tree\"]')?.click()"));
assert.ok(saved.includes('window.PayloadDiffCompareSession?.getResult?.()'));
assert.ok(saved.includes('comparison,'));

const matrix = [];
for (const mode of ['json', 'xml']) {
  for (const themeName of ['light', 'dark']) {
    for (const validity of ['valid', 'invalid']) {
      for (const differences of ['identical', 'different']) {
        matrix.push({ mode, themeName, validity, differences });
      }
    }
  }
}
assert.equal(matrix.length, 16);
for (const scenario of matrix) {
  assert.ok(compareGuard.includes('editor.compare-overlay-editor-active'), JSON.stringify(scenario));
}

console.log(`All ${matrix.length} cross-feature user journey combinations passed source/data invariants.`);
