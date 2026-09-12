import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const trace = await fs.readFile(new URL('./src/diagnostics-trace.js', import.meta.url), 'utf8');
const boot = await fs.readFile(new URL('./src/boot.js', import.meta.url), 'utf8');

// Deep correlated tracing remains available for dedicated debugging, but it is
// intentionally excluded from normal production boot: its repeated payload
// fingerprints and DOM/style snapshots are too expensive for multi-MB inputs.
assert.ok(!boot.includes("import './diagnostics-trace.js'"));

// Every important traced action should still be correlated from start through
// settled checkpoints when the diagnostic module is loaded explicitly.
assert.ok(trace.includes('trace.action-started'));
assert.ok(trace.includes('trace.action-checkpoint'));
assert.ok(trace.includes('trace.action-settled'));
assert.ok(trace.includes('actionId'));
assert.ok(trace.includes('ACTION_SETTLE_DELAYS'));

// Read-only actions must prove that they did not change either payload. The
// fingerprint is intentionally non-reversible and never exports payload text.
assert.ok(trace.includes('READ_ONLY_ACTION_CHANGED_PAYLOAD'));
assert.ok(trace.includes('capturePayloadFingerprints'));
assert.ok(trace.includes('sampleHash'));
assert.ok(trace.includes('sampledHash'));
assert.ok(trace.includes("'compare'"));
assert.ok(trace.includes("'search'"));
assert.ok(trace.includes("'view-tree'"));
assert.ok(trace.includes("'wrap'"));
assert.ok(trace.includes("'theme'"));
assert.ok(!trace.includes('payloadText:'));
assert.ok(!trace.includes('searchText:'));

// Rendering diagnostics still understand every supported surface when enabled.
assert.ok(trace.includes("'.smart-wrap-view'"));
assert.ok(trace.includes("'.aligned-compare-view'"));
assert.ok(trace.includes("'.tree-view'"));
assert.ok(trace.includes("'.fold-code-view'"));
assert.ok(trace.includes("'.editor'"));
assert.ok(trace.includes('captureOcclusion'));
assert.ok(trace.includes('document.elementsFromPoint'));
assert.ok(trace.includes('TRACE_ACTIVE_SURFACE_OCCLUDED'));

// Performance failures need a fallback even when PerformanceObserver longtask
// support is unavailable in the browser.
assert.ok(trace.includes('performance.event-loop-stall'));
assert.ok(trace.includes('performance.frame-stall'));
assert.ok(trace.includes('trace.interaction-to-paint'));

// DOM changes are summarized per action so rendering races can be reconstructed.
assert.ok(trace.includes('MutationObserver'));
assert.ok(trace.includes('attributeNames'));
assert.ok(trace.includes('addedNodes'));
assert.ok(trace.includes('removedNodes'));
assert.ok(trace.includes('touched'));

// Shared diagnostics: no JSON-only/XML-only behavior is allowed here.
assert.ok(!trace.includes("mode === 'json'"));
assert.ok(!trace.includes("mode === 'xml'"));

console.log('All correlated diagnostics trace tests passed.');
