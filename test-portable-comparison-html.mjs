import assert from 'node:assert/strict';
import { createComparisonSnapshot } from './src/comparison-file.js';
import {
  createPortableComparisonHtml,
  parsePortableComparisonHtml,
  portableComparisonDownloadName,
} from './src/portable-comparison-html.js';

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
    codeScroll: [{ top: 500, left: 0 }, { top: 520, left: 0 }],
    treeScroll: [{ top: 0, left: 0 }, { top: 0, left: 0 }],
  },
});

const html = createPortableComparisonHtml(snapshot);
assert.ok(html.startsWith('<!doctype html>'));
assert.ok(html.includes('id="payloaddiff-snapshot"'));
assert.ok(html.includes('Saved browser comparison'));
assert.ok(html.includes('Nothing is uploaded by this file'));

// Payload text containing </script> must not be able to terminate the embedded
// snapshot script and inject HTML/JS into the portable comparison document.
assert.ok(!html.includes('left </script><script>alert(1)</script>'));
assert.ok(html.includes('\\u003c/script\\u003e'));

const restored = parsePortableComparisonHtml(html);
assert.equal(restored.payloads.left, left);
assert.equal(restored.payloads.right, right);
assert.equal(restored.mode, 'json');
assert.equal(restored.ui.currentDiffIndex, 3);
assert.deepEqual(restored.ui.codeScroll[0], { top: 500, left: 0 });

const name = portableComparisonDownloadName(new Date('2026-09-10T01:54:44.954Z'));
assert.equal(name, 'payloaddiff-comparison-2026-09-10T01-54-44-954Z.html');
assert.ok(!name.endsWith('.payloaddiff'));

assert.throws(
  () => parsePortableComparisonHtml('<!doctype html><html><body>not a comparison</body></html>'),
  /does not contain a PayloadDiff saved comparison/i,
);

console.log('All portable comparison HTML tests passed.');
