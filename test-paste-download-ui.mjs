import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const paste = await readFile(new URL('./src/paste-buttons.js', import.meta.url), 'utf8');
const detect = await readFile(new URL('./src/payload-auto-detect.js', import.meta.url), 'utf8');
const saved = await readFile(new URL('./src/saved-comparisons.js', import.meta.url), 'utf8');

assert.ok(boot.includes("./paste-buttons.js"));
assert.ok(paste.includes("button.textContent = 'Paste'"));
assert.ok(paste.includes('navigator.clipboard?.readText'));
assert.ok(paste.includes("source: 'paste-button'"));
assert.ok(paste.includes("editor.dispatchEvent(new Event('input'"));
assert.ok(detect.includes("options.source === 'paste-button'"));

assert.ok(saved.includes("saveBtn.textContent = 'Download comparison'"));
assert.ok(saved.includes("saveBtn.id = 'downloadComparisonBtn'"));
assert.ok(saved.includes('function downloadComparison()'));
assert.ok(saved.includes('Run Compare before downloading a comparison.'));
assert.ok(saved.includes('Comparison downloaded as'));
assert.ok(!saved.includes("saveBtn.textContent = 'Save comparison'"));

console.log('Paste and Download comparison UI regression tests passed.');
