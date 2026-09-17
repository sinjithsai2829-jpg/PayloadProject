import assert from 'node:assert/strict';
import { compareFormattedCode } from './src/formatted-code-compare.js';
import { formatJsonBestEffort, formatXmlBestEffort } from './src/format-recovery.js';

// Real-world JSON records: a change inside an existing customer should be a
// modification on the corresponding displayed line, not a detached removal and
// addition caused by structural/path-only matching.
const jsonLeft = JSON.stringify({
  customers: [
    { customerId: 'CUST-1', name: 'Alice', status: 'ACTIVE' },
    { customerId: 'CUST-2', name: 'Bob', status: 'ACTIVE' },
  ],
}, null, 2);
const jsonRight = JSON.stringify({
  customers: [
    { customerId: 'CUST-1', name: 'Alice', status: 'ACTIVE' },
    { customerId: 'CUST-2', name: 'Robert', status: 'ACTIVE' },
  ],
}, null, 2);
const jsonCompare = compareFormattedCode('json', jsonLeft, jsonRight);
assert.equal(jsonCompare.summary.modified, 1);
assert.equal(jsonCompare.summary.added, 0);
assert.equal(jsonCompare.summary.removed, 0);
assert.ok(jsonCompare.diffs[0].leftLine > 0);
assert.ok(jsonCompare.diffs[0].rightLine > 0);

// Inserting a complete record should create an alignment gap while preserving
// later matching records instead of cascading every following line into a diff.
const jsonInserted = JSON.stringify({
  customers: [
    { customerId: 'CUST-1', name: 'Alice', status: 'ACTIVE' },
    { customerId: 'CUST-X', name: 'Inserted', status: 'NEW' },
    { customerId: 'CUST-2', name: 'Bob', status: 'ACTIVE' },
  ],
}, null, 2);
const jsonInsertCompare = compareFormattedCode('json', jsonLeft, jsonInserted);
assert.ok(jsonInsertCompare.summary.added > 0);
assert.ok(jsonInsertCompare.diffs.some((diff) => diff.leftLine == null && diff.rightLine > 0));
assert.ok(jsonInsertCompare.diffs.length < jsonInserted.split('\n').length / 2);

// XML follows the exact same Code-view contract.
const xmlLeft = [
  '<customers>',
  '  <customer id="CUST-1">',
  '    <name>Alice</name>',
  '  </customer>',
  '  <customer id="CUST-2">',
  '    <name>Bob</name>',
  '  </customer>',
  '</customers>',
].join('\n');
const xmlRight = xmlLeft.replace('<name>Bob</name>', '<name>Robert</name>');
const xmlCompare = compareFormattedCode('xml', xmlLeft, xmlRight);
assert.equal(xmlCompare.summary.modified, 1);
assert.equal(xmlCompare.summary.added, 0);
assert.equal(xmlCompare.summary.removed, 0);

// Exact escaped-quote shape seen in transported logs: outer JSON string parses,
// but its decoded value still contains escaped structural quotes. It must become
// a real multi-line JSON document instead of one giant quoted line.
const nestedEscapedJson = JSON.stringify(String.raw`{\"customer\":{\"id\":1,\"name\":\"Alice\"}}`);
const recoveredJson = formatJsonBestEffort(nestedEscapedJson);
assert.equal(recoveredJson.valid, true);
assert.deepEqual(recoveredJson.parsed, { customer: { id: 1, name: 'Alice' } });
assert.ok(recoveredJson.lineCount >= 5);
assert.ok(!recoveredJson.formatted.includes('\\"customer\\"'));

// Equivalent XML transport still uses the same recovery facade.
const nestedEscapedXml = JSON.stringify('<customers><customer id=\\"CUST-1\\"><name>Alice</name></customer></customers>');
const recoveredXml = formatXmlBestEffort(nestedEscapedXml);
assert.equal(recoveredXml.valid, true);
assert.match(recoveredXml.formatted, /id="CUST-1"/);
assert.ok(recoveredXml.formatted.includes('\n'));

console.log('All real-world JSON/XML compare and transport-format tests passed.');
