import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const boot = await fs.readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const persistence = await fs.readFile(new URL('./src/persistence.js', import.meta.url), 'utf8');
const worker = await fs.readFile(new URL('./src/worker.js', import.meta.url), 'utf8');

// Heavy parsing/formatting must stay off the browser UI thread for both JSON and XML.
assert.ok(worker.includes("task === 'format'"));
assert.ok(worker.includes('formatJsonBestEffort'));
assert.ok(worker.includes('formatXmlBestEffort'));
assert.ok(boot.includes("import './word-wrap.js'"));

// A multi-megabyte line must not be projected into thousands of Smart Wrap DOM spans
// during normal application boot. The native textarea's wrap implementation remains.
assert.ok(!boot.includes("import './smart-wrap-view.js'"));
assert.ok(!boot.includes("import './smart-wrap-scroll-bridge.js'"));
assert.ok(!boot.includes("import './smart-wrap-scroll-guard.js'"));

// Deep action tracing repeatedly fingerprints whole payloads and walks DOM styles. It
// remains available for explicit diagnostics, but must not tax every production action.
assert.ok(!boot.includes("import './diagnostics-trace.js'"));

// Persistence must not stringify the full JSON/XML payload just to detect whether it
// needs saving. Dirty revisions are O(1), and large writes wait for idle browser time.
assert.ok(persistence.includes('let revision = 0'));
assert.ok(persistence.includes('savedRevision'));
assert.ok(persistence.includes('requestIdleCallback'));
assert.ok(persistence.includes('revisionAtCapture'));
assert.ok(!persistence.includes('stateSignature'));
assert.ok(!persistence.includes('JSON.stringify({'));

// The performance path is deliberately payload-type agnostic.
assert.ok(!persistence.includes("mode === 'json'"));
assert.ok(!persistence.includes("mode === 'xml'"));

console.log('All huge-payload performance architecture tests passed.');
