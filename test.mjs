import { formatPayload, comparePayloads } from './src/core.js';
import { searchJsonTree } from './src/search.js';
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
const hugeSearchStart = performance.now();
const hugeSearch = searchJsonTree(hugeResult.parsed, '19999');
const hugeSearchElapsed = Math.round(performance.now() - hugeSearchStart);
assert.ok(hugeSearch.paths.some((path) => path.includes('[19999]')));
console.log(`PASS: huge JSON formatted to ${hugeResult.lineCount.toLocaleString()} lines in ${elapsed} ms under Node.`);
console.log(`PASS: huge JSON tree searched in ${hugeSearchElapsed} ms under Node.`);
console.log('All core tests passed.');
