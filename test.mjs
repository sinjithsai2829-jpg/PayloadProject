import { formatPayload, comparePayloads } from './src/core.js';
import { searchJsonTree } from './src/search.js';
import { compareJsonValues, attachPrettyJsonLineNumbers } from './src/fast-engine.js';
import assert from 'node:assert/strict';

const escaped = '{\\"name\\":\\"Sai\\",\\"nested\\":{\\"ok\\":true}}';
const jf = formatPayload({ mode: 'json', text: escaped });
assert.equal(jf.parsed.name, 'Sai');
assert.match(jf.formatted, /"nested"/);

const xf = formatPayload({ mode: 'xml', text: '<root name=\\"Sai\\"><id>123</id></root>' });
assert.match(xf.formatted, /name="Sai"/);
assert.match(xf.formatted, /  <id>/);

const jc = comparePayloads({ mode: 'json', left: '{"a":1,"b":2}', right: '{"a":1,"b":3,"c":4}' });
assert.equal(jc.summary.modified, 1);
assert.equal(jc.summary.added, 1);

const fastLeft = { a: 1, nested: { x: 2 }, rows: [{ id: 1, name: 'A' }] };
const fastRight = { a: 9, nested: { x: 2, y: true }, rows: [{ id: 1, name: 'B' }] };
const fast = compareJsonValues(fastLeft, fastRight);
assert.equal(fast.summary.modified, 2);
assert.equal(fast.summary.added, 1);
assert.equal(fast.summary.removed, 0);
const ordered = attachPrettyJsonLineNumbers(fastLeft, fastRight, fast.diffs);
assert.equal(ordered.length, 3);
assert.ok(ordered.every((diff) => diff.leftLine || diff.rightLine));
assert.ok(ordered.some((diff) => diff.path === '$.a' && diff.leftLine && diff.rightLine));
assert.ok(ordered.some((diff) => diff.path === '$.nested.y' && diff.rightLine && !diff.leftLine));

const xc = comparePayloads({ mode: 'xml', left: '<r><a>1</a><b>2</b></r>', right: '<r><a>1</a><x>9</x><b>2</b></r>' });
assert.equal(xc.identical, false);
assert.ok(xc.summary.added > 0);

const searchable = {
  offers: [
    { id: 'A1', passenger: { seatSelectable: true } },
    { id: 'B2', passenger: { seatSelectable: false } },
  ],
};
const search = searchJsonTree(searchable, 'seatSelectable');
assert.deepEqual(search.paths, [
  '$.offers[0].passenger.seatSelectable',
  '$.offers[1].passenger.seatSelectable',
]);
const valueSearch = searchJsonTree(searchable, 'B2');
assert.deepEqual(valueSearch.paths, ['$.offers[1].id']);

// ~100k formatted JSON lines: practical stress smoke test for the target payload size.
const huge = { offers: [] };
for (let i = 0; i < 20000; i += 1) huge.offers.push({ id: i, status: 'ACTIVE', price: i + 0.25 });
const hugeText = JSON.stringify(huge);
const start = performance.now();
const hugeResult = formatPayload({ mode: 'json', text: hugeText });
const elapsed = Math.round(performance.now() - start);
assert.ok(hugeResult.lineCount > 50000);

const hugeRight = structuredClone(huge);
hugeRight.offers[0].status = 'PENDING';
hugeRight.offers[10000].price = -1;
hugeRight.offers[19999].status = 'INACTIVE';
const fastStart = performance.now();
const hugeFast = compareJsonValues(huge, hugeRight);
const hugeOrdered = attachPrettyJsonLineNumbers(huge, hugeRight, hugeFast.diffs);
const fastElapsed = Math.round(performance.now() - fastStart);
assert.equal(hugeFast.summary.modified, 3);
assert.equal(hugeOrdered.length, 3);
assert.ok(hugeOrdered.every((diff) => diff.leftLine && diff.rightLine));

const hugeSearchStart = performance.now();
const hugeSearch = searchJsonTree(hugeResult.parsed, '19999');
const hugeSearchElapsed = Math.round(performance.now() - hugeSearchStart);
assert.ok(hugeSearch.paths.some((path) => path.includes('[19999]')));

// Regression: invalid intermediate JSON must fail fast without corrupting the last valid result.
let invalidError = null;
try {
  JSON.parse('{"a":1');
} catch (error) {
  invalidError = error;
}
assert.ok(invalidError instanceof Error);
assert.equal(fast.summary.modified, 2);
assert.equal(fast.summary.added, 1);

console.log(`PASS: huge JSON formatted to ${hugeResult.lineCount.toLocaleString()} lines in ${elapsed} ms under Node.`);
console.log(`PASS: fast structural comparison of ~20k records completed in ${fastElapsed} ms under Node.`);
console.log(`PASS: huge JSON tree searched in ${hugeSearchElapsed} ms under Node.`);
console.log('All core and fast-engine regression tests passed.');
