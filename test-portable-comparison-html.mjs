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
    panelNames: ['Production & Current', 'QA <Candidate>'],
    syncEnabled: true,
    currentDiffIndex: 3,
    codeScroll: [{ top: 500, left: 4 }, { top: 520, left: 5 }],
    treeScroll: [{ top: 0, left: 0 }, { top: 0, left: 0 }],
  },
});

const html = createPortableComparisonHtml(snapshot);
assert.equal(PORTABLE_EXPORT_VERSION, 'browser-v3');
assert.ok(html.startsWith('<!doctype html>'));
assert.ok(html.includes('id="payloaddiff-snapshot"'));
assert.ok(html.includes('Saved browser comparison'));
assert.ok(html.includes('Nothing is uploaded by this file'));
assert.ok(html.includes('data-payloaddiff-export="browser-v3"'));
assert.ok(html.includes('payloaddiff-export-version'));
assert.ok(html.includes('browser-v3'));

// Renamed panel labels are visible in the standalone saved comparison and are
// HTML-escaped so a user-supplied name cannot inject markup into the export.
assert.ok(html.includes('<strong>Production &amp; Current</strong>'));
assert.ok(html.includes('<strong>QA &lt;Candidate&gt;</strong>'));

const textareas = [...html.matchAll(/<textarea class="codeEditor" spellcheck="false" wrap="off">([\s\S]*?)<\/textarea>/g)];
assert.equal(textareas.length, 2);
assert.ok(textareas[0][1].includes('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.ok(textareas[1][1].includes('&quot;') === false);
assert.ok(textareas[1][1].includes('"value": 2'));
assert.ok(html.includes('Loading saved comparison…'));

assert.ok(!html.includes('left </script><script>alert(1)</script>'));
assert.ok(html.includes('\\u003c/script\\u003e'));

const restored = parsePortableComparisonHtml(html);
assert.equal(restored.payloads.left, left);
assert.equal(restored.payloads.right, right);
assert.equal(restored.mode, 'json');
assert.equal(restored.ui.currentDiffIndex, 3);
assert.deepEqual(restored.ui.codeScroll[0], { top: 500, left: 4 });
assert.deepEqual(restored.ui.panelNames, ['Production & Current', 'QA <Candidate>']);

const runtime = extractPortableRuntimeScript(html);
assert.doesNotThrow(() => new vm.Script(runtime));
assert.ok(runtime.includes("split('\\n')"));
assert.ok(runtime.includes('function isSimplePathKey(text)'));
assert.ok(runtime.includes('function isPathKeyStart(code)'));
assert.ok(runtime.includes('function pathAncestors(path){var out=['));
assert.ok(!runtime.includes('path.slice(1).match('));
assert.ok(!runtime.includes('return /^[A-Za-z_$]'));

const name = portableComparisonDownloadName(new Date('2026-09-10T01:54:44.954Z'));
assert.equal(name, 'payloaddiff-browser-v3-2026-09-10T01-54-44-954Z.html');
assert.ok(!name.endsWith('.payloaddiff'));

assert.throws(
  () => parsePortableComparisonHtml('<!doctype html><html><body>not a comparison</body></html>'),
  /does not contain a PayloadDiff saved comparison/i,
);

console.log('All portable comparison HTML tests passed.');
