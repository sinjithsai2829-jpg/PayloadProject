import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  LARGE_PAYLOAD_MAX_PHYSICAL_SCROLL,
  LARGE_PAYLOAD_THRESHOLD_CHARS,
  buildLineIndex,
  lineBounds,
  logicalOffsetFromPhysical,
  physicalExtent,
  physicalOffsetFromLogical,
  shouldUseLargePayloadMode,
  visibleCharacterWindow,
  visibleLineWindow,
} from './src/large-payload-model.js';
import { formatJsonFast } from './src/fast-format.js';

const hugeSingleLine = 'x'.repeat(2_000_000);
const single = buildLineIndex(hugeSingleLine);
assert.equal(single.lineCount, 1);
assert.equal(single.maxLineLength, 2_000_000);
assert.deepEqual(lineBounds(single.lineStarts, single.textLength, 0), { start: 0, end: 2_000_000 });
assert.ok(shouldUseLargePayloadMode(hugeSingleLine));
assert.ok(!shouldUseLargePayloadMode('small'));
assert.ok(LARGE_PAYLOAD_THRESHOLD_CHARS <= 512 * 1024);

const multiline = buildLineIndex('one\ntwo\nthree\n');
assert.equal(multiline.lineCount, 4);
assert.deepEqual(Array.from(multiline.lineStarts), [0, 4, 8, 14]);
assert.deepEqual(lineBounds(multiline.lineStarts, multiline.textLength, 1), { start: 4, end: 7 });

const physical = physicalExtent(80_000_000, 700);
assert.equal(physical, LARGE_PAYLOAD_MAX_PHYSICAL_SCROLL);
const logical = logicalOffsetFromPhysical({ physicalOffset: physical / 2, physicalExtent: physical, viewportExtent: 700, logicalExtent: 80_000_000 });
const roundTrip = physicalOffsetFromLogical({ logicalOffset: logical, physicalExtent: physical, viewportExtent: 700, logicalExtent: 80_000_000 });
assert.ok(Math.abs(roundTrip - physical / 2) < 2);

const lines = visibleLineWindow({ logicalScrollTop: 1_000_000, viewportHeight: 700, lineHeight: 20, lineCount: 2_000_000 });
assert.ok(lines.last - lines.first < 70, 'virtual renderer should keep a bounded visible line window');
const chars = visibleCharacterWindow({ logicalScrollLeft: 8_000_000, viewportWidth: 900, charWidth: 8, lineLength: 2_000_000 });
assert.ok(chars.last - chars.first <= 6000, 'virtual renderer must never paint a giant logical line in full');

const validJson = JSON.stringify({ rows: Array.from({ length: 5000 }, (_, index) => ({ index, value: `row-${index}` })) });
const formatted = formatJsonFast(validJson);
assert.equal(formatted.valid, true);
assert.equal(formatted.fastPath, true);
assert.ok(formatted.formatted.includes('\n'));

const boot = await fs.readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const controller = await fs.readFile(new URL('./src/large-payload-controller.js', import.meta.url), 'utf8');
const guard = await fs.readFile(new URL('./src/large-payload-performance-guard.js', import.meta.url), 'utf8');
const worker = await fs.readFile(new URL('./src/worker.js', import.meta.url), 'utf8');
const view = await fs.readFile(new URL('./src/large-payload-view.js', import.meta.url), 'utf8');

assert.ok(boot.indexOf("import './large-payload-performance-guard.js'") < boot.indexOf("import './word-wrap.js'"));
assert.ok(boot.indexOf("import './large-payload-performance-guard.js'") < boot.indexOf("import './code-folding.js'"));
assert.ok(controller.includes('formatWorkers = [createWorkerClient(), createWorkerClient()]'));
assert.ok(controller.includes('Promise.all(targets.map'));
assert.ok(controller.includes('performanceMode: true'));
assert.ok(controller.includes('includeParsed: false'));
assert.ok(controller.includes('includeIssues: false'));
assert.ok(worker.includes('formatJsonFast'));
assert.ok(worker.includes('formatXmlFast'));
assert.ok(worker.includes("payload.includeParsed === false"));
assert.ok(worker.includes('performanceMode'));
assert.ok(guard.includes('stopImmediatePropagation'));
assert.ok(view.includes('visibleCharacterWindow'));
assert.ok(view.includes('physicalOffsetFromLogical'));

// Shared huge-payload path: limits and virtualization must not diverge by payload type.
for (const source of [controller, guard, view]) {
  assert.ok(!source.includes("mode === 'json'"));
  assert.ok(!source.includes("mode === 'xml'"));
}

console.log('All virtual large-payload performance tests passed.');
