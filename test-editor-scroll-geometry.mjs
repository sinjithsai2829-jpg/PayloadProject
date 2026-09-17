import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const geometry = await fs.readFile(new URL('./src/editor-scroll-geometry.js', import.meta.url), 'utf8');
const boot = await fs.readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const editable = await fs.readFile(new URL('./src/editable-code-surface.js', import.meta.url), 'utf8');
const folding = await fs.readFile(new URL('./src/code-folding.js', import.meta.url), 'utf8');

// The canonical editor remains the only code surface. This module only owns
// geometry/scroll chrome and must load after the existing vertical scrollbar.
assert.ok(boot.includes("import './editor-scroll-geometry.js'"));
assert.ok(boot.indexOf("import './scrollbar-visibility.js'") < boot.indexOf("import './editor-scroll-geometry.js'"));

// One shared fixed gutter contract prevents horizontally scrolled source text
// from leaking into line numbers/fold controls.
assert.ok(geometry.includes('const CODE_GUTTER_PX = 78'));
assert.ok(geometry.includes('--pd-code-gutter-width'));
assert.ok(geometry.includes('.editor.editor-with-line-numbers'));
assert.ok(geometry.includes('padding-left: var(--pd-code-gutter-width) !important'));
assert.ok(geometry.includes('.editor-line-gutter'));
assert.ok(geometry.includes('width: var(--pd-code-gutter-width) !important'));
assert.ok(geometry.includes('left: 0 !important'));
assert.ok(editable.includes('editor-line-gutter'));
assert.ok(folding.includes('code-fold-gutter'));

// Native scrollbar chrome is hidden but overflow scrolling remains owned by the
// existing editor/tree/fold/aligned scrollers.
assert.ok(geometry.includes('scrollbar-width: none !important'));
assert.ok(geometry.includes('::-webkit-scrollbar'));
assert.ok(geometry.includes('width: 0 !important'));
assert.ok(geometry.includes('height: 0 !important'));

// PayloadDiff owns an explicit horizontal rail. It begins after the fixed code
// gutter for Code/Fold/Aligned surfaces and leaves the vertical rail a corner.
assert.ok(geometry.includes("rail.className = 'pd-horizontal-scrollbar hidden'"));
assert.ok(geometry.includes("rail.setAttribute('aria-orientation', 'horizontal')"));
assert.ok(geometry.includes("selected.surface === 'code' || selected.surface === 'fold' || selected.surface === 'aligned'"));
assert.ok(geometry.includes("rail.style.left = fixedGutter ? `${CODE_GUTTER_PX}px` : '4px'"));
assert.ok(geometry.includes("rail.style.right = vertical ? `${SCROLLBAR_SIZE_PX + 4}px` : '4px'"));
assert.ok(geometry.includes('.editor-wrap.pd-horizontal-scrollbar-present .pd-scrollbar-rail'));

// Mouse/pointer and keyboard horizontal navigation are both supported.
assert.ok(geometry.includes('onThumbPointerDown'));
assert.ok(geometry.includes('onRailPointerDown'));
assert.ok(geometry.includes('onRailKeyDown'));
assert.ok(geometry.includes("event.key === 'ArrowRight'"));
assert.ok(geometry.includes("event.key === 'ArrowLeft'"));
assert.ok(geometry.includes("event.key === 'Home'"));
assert.ok(geometry.includes("event.key === 'End'"));

// Light theme receives explicit app-owned scrollbar styling.
assert.ok(geometry.includes('html[data-theme="light"] .pd-horizontal-scrollbar'));
assert.ok(geometry.includes('html[data-theme="light"] .pd-horizontal-scrollbar-thumb'));

// Scroll/gutter geometry is payload-type neutral: JSON and XML share the exact
// same editor behavior.
assert.ok(!geometry.includes("mode === 'json'"));
assert.ok(!geometry.includes("mode === 'xml'"));
assert.ok(!geometry.includes("dataset.mode === 'json'"));
assert.ok(!geometry.includes("dataset.mode === 'xml'"));

console.log('All editor scroll geometry tests passed.');
