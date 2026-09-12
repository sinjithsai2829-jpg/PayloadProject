import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  SMART_WRAP_MAX_COLUMNS,
  continuationIndentColumn,
  smartWrapLayout,
  splitSmartWrappedLine,
} from './src/smart-wrap-model.js';

const boot = await fs.readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const view = await fs.readFile(new URL('./src/smart-wrap-view.js', import.meta.url), 'utf8');
const bridge = await fs.readFile(new URL('./src/smart-wrap-scroll-bridge.js', import.meta.url), 'utf8');
const guard = await fs.readFile(new URL('./src/smart-wrap-scroll-guard.js', import.meta.url), 'utf8');

assert.equal(SMART_WRAP_MAX_COLUMNS, 120);

const json = '        "desc": "Customer will be assigned the appropriate boarding priority by Delta operations and this description continues for testing"';
const jsonIndent = continuationIndentColumn(json, 72, 2);
assert.ok(jsonIndent > 8, 'JSON continuation should indent beyond the structural nesting');
assert.ok(jsonIndent < 36, 'JSON continuation indent should remain readable on a split pane');
const jsonLayout = smartWrapLayout(json, 72, 2);
assert.ok(jsonLayout.rows >= 2);
assert.equal(jsonLayout.segments[0].continuation, false);
assert.equal(jsonLayout.segments[1].continuation, true);
assert.equal(jsonLayout.continuationColumn, jsonIndent);
assert.equal(jsonLayout.segments.map((segment) => segment.text).join(''), json);

const xml = '      <message description="Customer will be assigned the appropriate boarding priority by Delta operations" code="ABC"/>';
const xmlIndent = continuationIndentColumn(xml, 68, 2);
assert.ok(xmlIndent > 6);
const xmlLayout = smartWrapLayout(xml, 68, 2);
assert.ok(xmlLayout.rows >= 2);
assert.equal(xmlLayout.segments.map((segment) => segment.text).join(''), xml);

const bounded = smartWrapLayout('x'.repeat(400), 500, 2);
assert.equal(bounded.maxColumns, 120);
assert.ok(bounded.rows >= 4);

const noLoss = splitSmartWrappedLine('abc def ghi jkl mno pqr stu', 12, 4, 2);
assert.equal(noLoss.map((segment) => segment.text).join(''), 'abc def ghi jkl mno pqr stu');
assert.ok(noLoss.every((segment) => segment.end > segment.start));

assert.ok(boot.includes("import './smart-wrap-view.js'"));
assert.ok(boot.includes("import './smart-wrap-scroll-bridge.js'"));
assert.ok(boot.includes("import './smart-wrap-scroll-guard.js'"));
assert.ok(view.includes("surface.className = 'smart-wrap-view hidden'"));
assert.ok(view.includes("continuationStrategy: 'hanging-indent'"));
assert.ok(view.includes('SMART_WRAP_MAX_COLUMNS'));
assert.ok(view.includes("row.className = `smart-wrap-row"));
assert.ok(view.includes('Double-click') || view.includes('beginSourceEdit'));
assert.ok(view.includes('aligned-compare-text'));
assert.ok(bridge.includes('syncFromEditor'));
assert.ok(bridge.includes('syncFromSmart'));
assert.ok(bridge.includes("directions[index] = 'smart-to-editor'") || bridge.includes("beginBridge(index, 'smart-to-editor')"));
assert.ok(bridge.includes('PayloadDiffSmartWrapScrollBridge'));
assert.ok(guard.includes('isSyncingFromSmart'));
assert.ok(guard.includes('stopImmediatePropagation'));
assert.ok(guard.includes('capture: true'));

// Shared renderer and scroll fix: Smart Wrap behavior must never diverge by
// payload mode, so the same regression fix covers both JSON and XML.
for (const source of [view, bridge, guard]) {
  assert.ok(!source.includes("mode === 'json'"));
  assert.ok(!source.includes("mode === 'xml'"));
}

console.log('All Smart Wrap tests passed.');
