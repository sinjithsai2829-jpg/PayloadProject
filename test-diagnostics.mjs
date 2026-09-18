import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DIAGNOSTICS_SCHEMA_VERSION,
  MAX_DIAGNOSTIC_EVENTS,
  createDiagnosticEvent,
  sanitizeDiagnosticString,
  sanitizeDiagnosticValue,
  summarizeDiagnosticEvents,
  trimDiagnosticEvents,
} from './src/diagnostics-core.js';

const jsonPayload = JSON.stringify({ records: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Customer ${i}` })) }, null, 2);
const xmlPayload = `<root>${'<item value="secret"/>'.repeat(30)}</root>`;

const sanitizedJson = sanitizeDiagnosticString(jsonPayload);
assert.match(sanitizedJson, /^\[payload-redacted length=/);
assert.equal(sanitizedJson.includes('Customer 1'), false);

const sanitizedXml = sanitizeDiagnosticString(xmlPayload);
assert.match(sanitizedXml, /^\[payload-redacted length=/);
assert.equal(sanitizedXml.includes('secret'), false);

const nested = sanitizeDiagnosticValue({
  payload: jsonPayload,
  payloads: { left: jsonPayload, right: jsonPayload },
  content: xmlPayload,
  query: 'sensitive customer search',
  searchText: 'another private query',
  selectionText: 'private selected value',
  clipboard: 'private clipboard value',
  message: 'Invalid JSON at line 12 column 4',
  chars: 12345,
});
assert.equal(nested.payload, '[redacted]');
assert.equal(nested.payloads, '[redacted]');
assert.equal(nested.content, '[redacted]');
assert.equal(nested.query, '[redacted]');
assert.equal(nested.searchText, '[redacted]');
assert.equal(nested.selectionText, '[redacted]');
assert.equal(nested.clipboard, '[redacted]');
assert.equal(nested.message, 'Invalid JSON at line 12 column 4');
assert.equal(nested.chars, 12345);

const error = new Error('comparison failed');
const event = createDiagnosticEvent({
  level: 'error',
  type: 'comparison.error',
  data: { error, payload: jsonPayload },
  now: new Date('2026-09-09T20:42:00.000Z'),
});
assert.equal(event.level, 'error');
assert.equal(event.type, 'comparison.error');
assert.equal(event.data.payload, '[redacted]');
assert.equal(event.data.error.message, 'comparison failed');

const many = Array.from({ length: MAX_DIAGNOSTIC_EVENTS + 50 }, (_, i) => ({ i }));
const trimmed = trimDiagnosticEvents(many);
assert.equal(trimmed.length, MAX_DIAGNOSTIC_EVENTS);
assert.equal(trimmed[0].i, 50);

const summary = summarizeDiagnosticEvents([
  { level: 'info', type: 'compare.click.started' },
  { level: 'warn', type: 'ui.anomaly-detected' },
  { level: 'warn', type: 'ui.anomaly-detected' },
]);
assert.equal(summary.total, 3);
assert.equal(summary.levels.info, 1);
assert.equal(summary.levels.warn, 2);
assert.equal(summary.types['ui.anomaly-detected'], 2);
assert.ok(DIAGNOSTICS_SCHEMA_VERSION >= 2);
assert.ok(MAX_DIAGNOSTIC_EVENTS >= 1000, 'diagnostics should retain a long debugging timeline');

const diagnosticsSource = await readFile(new URL('./src/diagnostics.js', import.meta.url), 'utf8');
for (const requiredSignal of [
  'captureEnvironment()',
  'capturePane(index)',
  'captureCompareState()',
  'captureElementState',
  'detectAnomalies()',
  'OPAQUE_DIFF_OVERLAY_CAN_COVER_EDITOR',
  'CODE_SELECTED_EDITOR_HIDDEN',
  'TREE_SELECTED_EDITOR_VISIBLE',
  'performance.long-task',
  'performance.layout-shift',
  'ui.keyboard-shortcut',
  'editor.scrolled',
  'payloaddiff:live-compare-updated',
  'payloaddiff:diff-selection-changed',
  'payloaddiff:syntax-issues-updated',
  'payloaddiff:view-surface-synced',
  'lineMapSample',
  'diagnosticsSchemaVersion',
]) {
  assert.ok(diagnosticsSource.includes(requiredSignal), `rich diagnostics missing signal: ${requiredSignal}`);
}

assert.ok(diagnosticsSource.includes('queryLength'));
assert.ok(diagnosticsSource.includes('panelNameLength'));
// A folded Code projection is a valid visible Code surface even though the canonical textarea is hidden.
assert.ok(diagnosticsSource.includes("pane.querySelector('.fold-code-view')"), 'folded Code projection must participate in visibility diagnostics');
assert.ok(diagnosticsSource.includes('codeSurfaceVisible = editorState.visible || foldState.visible || alignedState.visible'));
assert.ok(diagnosticsSource.includes('setTimeout(() => {\n        mutationTimer = 0;'), 'DOM diagnostics should coalesce mutation bursts');
assert.ok(diagnosticsSource.includes('for (const delay of [0, 100, 1000, 3000])'), 'operation diagnostics should avoid excessive deep checkpoints');
assert.ok(!diagnosticsSource.includes('selectionText:'), 'diagnostics must not copy selected payload text');
assert.ok(!diagnosticsSource.includes('searchText:'), 'diagnostics must not copy search text');
assert.ok(!diagnosticsSource.includes('clipboardText:'), 'diagnostics must not copy clipboard text');

console.log('PASS: diagnostics redact payload/search/selection/clipboard content and retain useful metadata.');
console.log(`PASS: diagnostics history is capped at ${MAX_DIAGNOSTIC_EVENTS} rich events.`);
console.log('PASS: diagnostics capture render layers, anomalies, interactions, comparison state, and performance signals.');
