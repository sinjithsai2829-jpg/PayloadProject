import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const paste = await readFile(new URL('./src/paste-buttons.js', import.meta.url), 'utf8');
const labels = await readFile(new URL('./src/ui-labels.js', import.meta.url), 'utf8');
const detect = await readFile(new URL('./src/payload-auto-detect.js', import.meta.url), 'utf8');
const saved = await readFile(new URL('./src/saved-comparisons.js', import.meta.url), 'utf8');

assert.ok(boot.includes("./ui-labels.js"));
assert.ok(boot.includes("./paste-buttons.js"));
assert.ok(labels.includes("formatButton.textContent = 'Format'"));
assert.ok(labels.includes("clearButton.textContent = 'Clear both'"));
assert.ok(labels.includes("Format both payload panels"));
assert.ok(labels.includes("Clear both payload panels"));

assert.ok(paste.includes("button.textContent = 'Paste'"));
assert.ok(paste.includes('navigator.clipboard?.readText'));
assert.ok(paste.includes("source: 'paste-button'"));
assert.ok(paste.includes("editor.dispatchEvent(new Event('input'"));
assert.ok(paste.includes("const copy = actions.querySelector('.copy-btn')"));
assert.ok(paste.includes('actions.insertBefore(button, copy)'));
assert.ok(paste.includes('actions.appendChild(upload)'));
assert.ok(detect.includes("options.source === 'paste-button'"));

assert.ok(saved.includes("saveBtn.textContent = 'Download comparison'"));
assert.ok(saved.includes("saveBtn.id = 'downloadComparisonBtn'"));
assert.ok(saved.includes('function downloadComparison()'));
assert.ok(saved.includes('Run Compare before downloading a comparison.'));
assert.ok(saved.includes('Comparison downloaded as'));
assert.ok(!saved.includes("saveBtn.textContent = 'Save comparison'"));

// This is shared chrome. The requested labels/action order must not be gated to
// one payload format.
assert.ok(!labels.includes("mode === 'json'"));
assert.ok(!labels.includes("mode === 'xml'"));
assert.ok(!paste.includes("mode === 'json'"));
assert.ok(!paste.includes("mode === 'xml'"));

console.log('Paste and Download comparison UI regression tests passed.');
