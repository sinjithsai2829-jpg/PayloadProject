import assert from 'node:assert/strict';
import fs from 'node:fs';

const scrollbar = fs.readFileSync('./src/scrollbar-visibility.js', 'utf8');
const aligned = fs.readFileSync('./src/aligned-compare-view.js', 'utf8');

// Native macOS/Chrome overlay scrollbars may auto-hide even when CSS colors are
// correct. PayloadDiff therefore owns a persistent rail/thumb for every visible
// pane scroller.
assert.ok(scrollbar.includes("rail.className = 'pd-scrollbar-rail hidden'"));
assert.ok(scrollbar.includes("thumb.className = 'pd-scrollbar-thumb'"));
assert.ok(scrollbar.includes("rail.setAttribute('role', 'scrollbar')"));
assert.ok(scrollbar.includes('aria-valuenow'));
assert.ok(scrollbar.includes('aria-valuemax'));
assert.ok(scrollbar.includes('onThumbPointerDown'));
assert.ok(scrollbar.includes('onRailPointerDown'));
assert.ok(scrollbar.includes('onRailKeyDown'));
assert.ok(scrollbar.includes('setPointerCapture'));
assert.ok(scrollbar.includes("event.key === 'PageDown'"));
assert.ok(scrollbar.includes("event.key === 'Home'"));
assert.ok(scrollbar.includes("event.key === 'End'"));

// The active vertical scroller can change with Code/Tree/folding/aligned diff.
assert.ok(scrollbar.includes("['aligned', pane.querySelector('.aligned-compare-view')]"));
assert.ok(scrollbar.includes("['fold', pane.querySelector('.fold-code-view')]"));
assert.ok(scrollbar.includes("['tree', pane.querySelector('.tree-view')]"));
assert.ok(scrollbar.includes("['code', pane.querySelector('.editor')]"));
assert.ok(aligned.includes("surface.className = 'aligned-compare-view hidden'"));

// Light mode has an explicit persistent rail and thumb; visibility no longer
// depends on macOS overlay-scrollbar preferences.
assert.ok(scrollbar.includes('html[data-theme="light"] .pd-scrollbar-rail'));
assert.ok(scrollbar.includes('html[data-theme="light"] .pd-scrollbar-thumb'));
assert.ok(scrollbar.includes('background: #e2e8f0'));
assert.ok(scrollbar.includes('background: #64748b'));
assert.ok(scrollbar.includes('.editor-wrap.pd-scrollbar-present .syntax-error-rail'));
assert.ok(scrollbar.includes("window.PayloadDiffScrollbars"));
assert.ok(scrollbar.includes("payloaddiff:scrollbar-state-changed"));
assert.ok(scrollbar.includes("scrollbar.state-changed"));

// Native scrollbars remain styled as a fallback and for horizontal movement.
assert.ok(scrollbar.includes('scrollbar-color'));
assert.ok(scrollbar.includes('color-scheme: light'));
assert.ok(scrollbar.includes('::-webkit-scrollbar-track'));
assert.ok(scrollbar.includes('::-webkit-scrollbar-thumb'));

// Shared implementation for JSON and XML.
assert.ok(!scrollbar.includes("mode === 'json'"));
assert.ok(!scrollbar.includes("mode === 'xml'"));

console.log('All scrollbar theme tests passed.');
