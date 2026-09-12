import assert from 'node:assert/strict';
import fs from 'node:fs';

const scrollbar = fs.readFileSync('./src/scrollbar-visibility.js', 'utf8');
const aligned = fs.readFileSync('./src/aligned-compare-view.js', 'utf8');

// A one-sided added/removed diff activates the aligned comparison surface,
// which is a separate scroll container from the textarea. Every scroll surface
// must therefore receive the same theme-aware scrollbar treatment.
assert.ok(aligned.includes("surface.className = 'aligned-compare-view hidden'"));
assert.ok(aligned.includes('overflow: auto'));
assert.ok(scrollbar.includes('.aligned-compare-view'));
assert.ok(scrollbar.includes('html[data-theme="light"] .aligned-compare-view'));
assert.ok(scrollbar.includes('scrollbar-color: #475569 #e2e8f0 !important'));
assert.ok(scrollbar.includes('scrollbar-gutter: stable'));
assert.ok(scrollbar.includes('color-scheme: light'));
assert.ok(scrollbar.includes('width: 16px'));
assert.ok(scrollbar.includes('min-height: 48px'));
assert.ok(scrollbar.includes('background: #475569 !important'));
assert.ok(scrollbar.includes('background: #334155 !important'));
assert.ok(scrollbar.includes('background: #1e293b !important'));
assert.ok(scrollbar.includes('.aligned-compare-view::-webkit-scrollbar-track'));
assert.ok(scrollbar.includes('.aligned-compare-view::-webkit-scrollbar-thumb'));
assert.ok(scrollbar.includes('.aligned-compare-view::-webkit-scrollbar-corner'));

// The implementation is shared by JSON and XML; no mode-specific branch is
// allowed in the scrollbar layer.
assert.ok(!scrollbar.includes("mode === 'json'"));
assert.ok(!scrollbar.includes("mode === 'xml'"));

console.log('All scrollbar theme tests passed.');
