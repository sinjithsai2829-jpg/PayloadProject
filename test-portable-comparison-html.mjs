import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createComparisonSnapshot } from './src/comparison-file.js';
import {
  createPortableComparisonHtml,
  parsePortableComparisonHtml,
  portableComparisonDownloadName,
  extractPortableRuntimeScript,
  PORTABLE_EXPORT_VERSION,
} from './src/portable-comparison-html-safe.js';

const left = '{\n  "message": "left </script><script>alert(1)</script>",\n  "value": 1\n}';
const right = '{\n  "message": "right",\n  "value": 2\n}';

const snapshot = createComparisonSnapshot({
  mode: 'json',
  left,
  right,
  ui: {
    views: ['code', 'code'],
    theme: 'light',
    panelNames: ['Production & Current', 'QA <Candidate>'],
    syncEnabled: true,
    currentDiffIndex: 1,
    codeScroll: [{ top: 500, left: 4 }, { top: 520, left: 5 }],
    treeScroll: [{ top: 0, left: 0 }, { top: 0, left: 0 }],
  },
  comparison: {
    mode: 'json',
    comparisonKind: 'structural',
    diffs: [
      { path: '$.message', type: 'modified', leftLine: 2, rightLine: 2 },
      { path: '$.value', type: 'modified', leftLine: 3, rightLine: 3 },
    ],
    summary: { added: 0, removed: 0, modified: 2, truncated: false },
    identical: false,
    elapsedMs: 2,
  },
});

const html = createPortableComparisonHtml(snapshot);
assert.equal(PORTABLE_EXPORT_VERSION, 'browser-v4');
assert.ok(html.startsWith('<!doctype html>'));
assert.ok(html.includes('id="payloaddiff-snapshot"'));
assert.ok(html.includes('Saved browser comparison'));
assert.ok(html.includes('Nothing is uploaded by this file'));
assert.ok(html.includes('data-payloaddiff-export="browser-v4"'));
assert.ok(html.includes('payloaddiff-export-version'));
assert.ok(html.includes('browser-v4'));
assert.ok(html.includes('data-theme="light"'));
assert.ok(html.includes('id="payloaddiff-v4-theme"'));

// Renamed panel labels are visible in the standalone saved comparison and are
// HTML-escaped so a user-supplied name cannot inject markup into the export.
assert.ok(html.includes('<strong>Production &amp; Current</strong>'));
assert.ok(html.includes('<strong>QA &lt;Candidate&gt;</strong>'));

// Difference navigation parity: saved browser comparisons use browser-stable
// SVG first / previous / next / last controls instead of font-dependent glyphs.
assert.ok(html.includes('id="first" title="First difference"'));
assert.ok(html.includes('id="prev" title="Previous difference"'));
assert.ok(html.includes('id="next" title="Next difference"'));
assert.ok(html.includes('id="last" title="Last difference"'));
assert.ok(html.includes('<svg viewBox="0 0 20 20" aria-hidden="true">'));
assert.ok(html.includes('stroke:currentColor'));
assert.ok(!html.includes('← Previous'));
assert.ok(!html.includes('Next →'));
assert.ok(!html.includes('>⤒</button>'));
assert.ok(!html.includes('>⤓</button>'));

// browser-v4 must restore the exact comparison captured by the live website.
// Direct-open from Downloads must not recompute with the older standalone
// parser and silently turn a real comparison into 0 changes / 0 of 0.
assert.ok(html.includes('function restoreSavedComparison()'));
assert.ok(html.includes('snapshot&&snapshot.comparison'));
assert.ok(html.includes('if(!restoreSavedComparison())recompare(true);'));
assert.ok(html.includes('Saved comparison ready'));
assert.ok(html.includes('"modified":2'));
assert.ok(html.includes('"path":"$.message"'));

const textareas = [...html.matchAll(/<textarea class="codeEditor" spellcheck="false" wrap="off">([\s\S]*?)<\/textarea>/g)];
assert.equal(textareas.length, 2);
assert.ok(textareas[0][1].includes('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.ok(textareas[1][1].includes('&quot;') === false);
assert.ok(textareas[1][1].includes('"value": 2'));
assert.ok(html.includes('Loading downloaded comparison…'));

assert.ok(!html.includes('left </script><script>alert(1)</script>'));
assert.ok(html.includes('\\u003c/script\\u003e'));

const restored = parsePortableComparisonHtml(html);
assert.equal(restored.payloads.left, left);
assert.equal(restored.payloads.right, right);
assert.equal(restored.mode, 'json');
assert.equal(restored.ui.currentDiffIndex, 1);
assert.equal(restored.ui.theme, 'light');
assert.deepEqual(restored.ui.codeScroll[0], { top: 500, left: 4 });
assert.deepEqual(restored.ui.panelNames, ['Production & Current', 'QA <Candidate>']);
assert.equal(restored.comparison.diffs.length, 2);
assert.equal(restored.comparison.summary.modified, 2);

const runtime = extractPortableRuntimeScript(html);
assert.doesNotThrow(() => new vm.Script(runtime));
assert.ok(runtime.includes("split('\\n')"));
assert.ok(runtime.includes('function isSimplePathKey(text)'));
assert.ok(runtime.includes('function isPathKeyStart(code)'));
assert.ok(runtime.includes('function pathAncestors(path){var out=['));
assert.ok(!runtime.includes('path.slice(1).match('));
assert.ok(!runtime.includes('return /^[A-Za-z_$]'));
assert.ok(runtime.includes("first.addEventListener('click'"));
assert.ok(runtime.includes("last.addEventListener('click'"));
assert.ok(runtime.includes('function goAbsolute(index)'));
assert.ok(runtime.includes('function restoreSavedComparison()'));

const name = portableComparisonDownloadName(new Date('2026-09-10T01:54:44.954Z'));
assert.equal(name, 'payloaddiff-browser-v4-2026-09-10T01-54-44-954Z.html');
assert.ok(!name.endsWith('.payloaddiff'));

assert.throws(
  () => parsePortableComparisonHtml('<!doctype html><html><body>not a comparison</body></html>'),
  /does not contain a PayloadDiff saved comparison/i,
);

console.log('All portable comparison HTML tests passed.');
