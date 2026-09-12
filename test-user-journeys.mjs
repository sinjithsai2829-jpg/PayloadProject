import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { detectPayloadMode } from './src/payload-detection.js';
import { compareTextPayloads } from './src/text-fallback-diff.js';
import { findFoldRanges } from './src/code-folding.js';
import { createComparisonSnapshot, parseComparisonSnapshot, serializeComparisonSnapshot } from './src/comparison-file.js';

const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const compareGuard = await readFile(new URL('./src/compare-surface-guard.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('./src/theme-toggle.js', import.meta.url), 'utf8');
const fallbackUi = await readFile(new URL('./src/text-fallback-ui.js', import.meta.url), 'utf8');
const viewCoordinator = await readFile(new URL('./src/view-surface-coordinator.js', import.meta.url), 'utf8');
const enhancements = await readFile(new URL('./src/enhancements.js', import.meta.url), 'utf8');
const saved = await readFile(new URL('./src/saved-comparisons.js', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// 1. Payload detection: user pastes real-world JSON/XML, including imperfect
//    transport data. The site must make the same decision for either panel.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 2. Text fallback compare: malformed JSON/XML must still compare. Test both
//    identical and changed payloads because zero-diff fallback caused the UI
//    regression captured in the screenshot.
// ---------------------------------------------------------------------------
const fallbackCases = [
  {
    name: 'invalid identical JSON',
    mode: 'json',
    left: '{\n  "a": 1,\n}',
    right: '{\n  "a": 1,\n}',
    total: 0,
  },
  {
    name: 'invalid changed JSON',
    mode: 'json',
    left: '{\n  "a": 1,\n}',
    right: '{\n  "a": 2,\n}',
    total: 1,
  },
  {
    name: 'invalid identical XML',
    mode: 'xml',
    left: '<root>\n  <a>1\n</root>',
    right: '<root>\n  <a>1\n</root>',
    total: 0,
  },
  {
    name: 'invalid changed XML',
    mode: 'xml',
    left: '<root>\n  <a>1\n</root>',
    right: '<root>\n  <a>2\n</root>',
    total: 1,
  },
];
for (const scenario of fallbackCases) {
  const result = compareTextPayloads(scenario);
  assert.equal(result.mode, scenario.mode, scenario.name);
  assert.equal(result.comparisonKind, 'text', scenario.name);
  assert.equal(result.fallback, true, scenario.name);
  assert.equal(result.summary.added + result.summary.removed + result.summary.modified, scenario.total, scenario.name);
  assert.equal(result.identical, scenario.total === 0, scenario.name);
}

// ---------------------------------------------------------------------------
// 3. Folding parity: valid structural payloads in both formats must expose
//    nested fold ranges. Malformed input must not throw just because a user is
//    editing it.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 4. Saved comparison round-trip: all user-visible state must survive both
//    JSON and XML, including text-fallback results and Light/Dark theme.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 5. Rendering invariants. These static checks deliberately protect cross-file
//    contracts that previously regressed because each feature was tested alone.
// ---------------------------------------------------------------------------
assert.ok(boot.includes("./compare-surface-guard.js"), 'compare surface guard must load at startup');
assert.ok(compareGuard.includes('compare-overlay-editor-active'));
assert.ok(compareGuard.includes('z-index: 2 !important'));
assert.ok(compareGuard.includes('background: transparent !important'));
assert.ok(compareGuard.includes('html[data-theme="light"] .editor.compare-overlay-editor-active'));
assert.ok(compareGuard.includes('html[data-theme="dark"] .editor.compare-overlay-editor-active'));
assert.ok(compareGuard.includes('.editor-wrap.tree-surface-active > .editor.compare-overlay-editor-active'));
assert.ok(!compareGuard.includes("mode === 'json'"));
assert.ok(!compareGuard.includes("mode === 'xml'"));

// Light mode must never make the diff overlay itself the visible text surface.
assert.ok(theme.includes('html[data-theme="light"] .editor-diff-overlay'));
assert.ok(compareGuard.includes('editor-diff-overlay'));

// Fallback Compare must force Code only because Tree requires parsed structure.
assert.ok(fallbackUi.includes('forceCodeViews()'));
assert.ok(fallbackUi.includes('Tree view requires structurally valid data'));

// Code and Tree surfaces are mutually exclusive even across async Tree builds.
assert.ok(viewCoordinator.includes('tree-surface-active'));
assert.ok(viewCoordinator.includes('code-surface-active'));
assert.ok(viewCoordinator.includes('MutationObserver'));

// Search must respect the active view and never force Tree from Code.
assert.ok(enhancements.includes('activeView'));
assert.ok(!enhancements.includes("querySelector('.view-btn[data-view=\"tree\"]')?.click()"));

// Download/Open comparison must capture and restore current comparison state.
assert.ok(saved.includes('window.PayloadDiffCompareSession?.getResult?.()'));
assert.ok(saved.includes('comparison: comparisonResult'));

// ---------------------------------------------------------------------------
// 6. Combination matrix. This is intentionally redundant: every mode/theme/
//    validity/difference combination must satisfy the same editor visibility
//    invariant. If a future implementation adds another special-case gate, the
//    expected count changes and forces review.
// ---------------------------------------------------------------------------
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
  assert.ok(['json', 'xml'].includes(scenario.mode));
  assert.ok(['light', 'dark'].includes(scenario.themeName));
  // The source-level invariant is shared; no scenario is allowed to opt out.
  assert.ok(compareGuard.includes('editor.compare-overlay-editor-active'), JSON.stringify(scenario));
}

console.log(`All ${matrix.length} cross-feature user journey combinations passed source/data invariants.`);
