import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const guard = await fs.readFile(new URL('./src/wrap-indent-guide-guard.js', import.meta.url), 'utf8');
const boot = await fs.readFile(new URL('./src/boot.js', import.meta.url), 'utf8');

assert.ok(boot.includes("import './wrap-indent-guide-guard.js'"));
assert.ok(guard.includes('.pane.word-wrap-active .editor-indent-guide'));
assert.ok(guard.includes('height: var(--pd-wrap-guide-height, 20px) !important'));
assert.ok(guard.includes('max-height: var(--pd-wrap-guide-height, 20px) !important'));
assert.ok(guard.includes("payloaddiff:word-wrap-changed"));
assert.ok(guard.includes("payloaddiff:word-wrap-layout"));
assert.ok(!guard.includes("mode === 'json'"));
assert.ok(!guard.includes("mode === 'xml'"));

console.log('All wrapped indentation guide tests passed.');
