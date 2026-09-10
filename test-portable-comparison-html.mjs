import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createComparisonSnapshot } from './src/comparison-file.js';
import {
  createPortableComparisonHtml,
  parsePortableComparisonHtml,
  portableComparisonDownloadName,
  extractPortableRuntimeScript,
} from './src/portable-comparison-html-safe.js';

const left = '{\n  "message": "left </script><script>alert(1)</script>",\n  "value": 1\n}';
const right = '{\n  "message": "right",\n  "value": 2\n}';

const snapshot = createComparisonSnapshot({
  mode: 'json',
  left,
  right,
  ui: {
    views: ['code', 'code'],
    syncEnabled: true,
    currentDiffIndex: 3,
    codeScroll: [{ top: 500, left: 4 }, { top: 520, left: 5 }],
    treeScroll: [{ top: 0, left: 0 }, { top: 0, left: 0 }],
  },
});

const html = createPortableComparisonHtml(snapshot);
assert.ok(html.startsWith('<!doctype html>'));
assert.ok(html.includes('id="payloaddiff-snapshot"'));
assert.ok(html.includes('Saved browser comparison'));
assert.ok(html.includes('Nothing is uploaded by this file'));
assert.ok(html.includes('data-payloaddiff-export="browser-v2"'));
assert.ok(html.includes('payloaddiff-export-version'));

// Fail-safe regression: even if JavaScript fails, both payload textareas must
// already contain visible saved content in the static HTML.
const textareas = [...html.matchAll(/<textarea class="codeEditor" spellcheck="false" wrap="off">([\s\S]*?)<\/textarea>/g)];
assert.equal(textareas.length, 2);
assert.ok(textareas[0][1].includes('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.ok(textareas[1][1].includes('&quot;') === false); // quotes are valid textarea text and need no escaping
assert.ok(textareas[1][1].includes('"value": 2'));
assert.ok(html.includes('browser-v2'));
assert.ok(html.includes('Loading saved comparison…'));

// Snapshot data still has script-breaking characters escaped.
assert.ok(!html.includes('left </script><script>alert(1)</script>'));
assert.ok(html.includes('\\u003c/script\\u003e'));

const restored = parsePortableComparisonHtml(html);
assert.equal(restored.payloads.left, left);
assert.equal(restored.payloads.right, right);
assert.equal(restored.mode, 'json');
assert.equal(restored.ui.currentDiffIndex, 3);
assert.deepEqual(restored.ui.codeScroll[0], { top: 500, left: 4 });

// The downloaded HTML must contain syntactically valid executable JavaScript.
const runtime = extractPortableRuntimeScript(html);
assert.doesNotThrow(() => new vm.Script(runtime));
assert.ok(runtime.includes("split('\\n')"));

const name = portableComparisonDownloadName(new Date('2026-09-10T01:54:44.954Z'));
assert.equal(name, 'payloaddiff-browser-v2-2026-09-10T01-54-44-954Z.html');
assert.ok(!name.endsWith('.payloaddiff'));

assert.throws(
  () => parsePortableComparisonHtml('<!doctype html><html><body>not a comparison</body></html>'),
  /does not contain a PayloadDiff saved comparison/i,
);

console.log('All portable comparison HTML tests passed.');
