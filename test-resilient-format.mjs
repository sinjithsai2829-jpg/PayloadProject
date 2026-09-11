import assert from 'node:assert/strict';
import {
  formatJsonBestEffort,
  formatXmlBestEffort,
  prettyJsonLoose,
} from './src/resilient-format.js';

// Real-world transported JSON shape: structural quotes escaped, invalid source-
// language apostrophe/entity escapes, an embedded quote, and wrapper punctuation.
const transported = String.raw`{\"orders\":[{\"description\":\"Earn MQD\\'s\",\"brand\":\"Delta One\\&#174; Classic\",\"screen\":\"Seatback Screen Size - 18\\\\\\\" FC\"}]}\"\n        }`;
const recovered = formatJsonBestEffort(transported);
assert.equal(recovered.valid, true);
assert.equal(recovered.bestEffort, false);
assert.ok(recovered.lineCount > 5);
assert.equal(recovered.parsed.orders[0].description, "Earn MQD's");
assert.equal(recovered.parsed.orders[0].brand, 'Delta One&#174; Classic');
assert.equal(recovered.parsed.orders[0].screen, 'Seatback Screen Size - 18" FC');

// Trailing commas are common in copied logs/config snippets and should be
// repaired when doing so results in unambiguous valid JSON.
const trailingComma = formatJsonBestEffort('{"a":1,"nested":{"b":2,},}');
assert.equal(trailingComma.valid, true);
assert.deepEqual(trailingComma.parsed, { a: 1, nested: { b: 2 } });

// Formatting is not validation. Even when recovery cannot make the document
// structurally valid, Code view must still become readable instead of remaining
// a single raw line and throwing the content away.
const brokenJson = '{"orders":[{"id":1,"name":"A"},{"id":2,"name":"B"],"tail":true}';
const looseJson = formatJsonBestEffort(brokenJson);
assert.equal(looseJson.valid, false);
assert.equal(looseJson.bestEffort, true);
assert.ok(looseJson.formatted.split('\n').length >= 5);
assert.match(looseJson.repairNote, /best-effort/i);
assert.match(looseJson.warning, /JSON/i);

const loose = prettyJsonLoose('{"a":1,"b":[2,3],BROKEN}');
assert.ok(loose.split('\n').length >= 4);

// XML follows the same product contract: syntax problems may disable structural
// features, but must not block Code formatting.
const escapedXml = formatXmlBestEffort('<root name=\\"Sai\\"><id>123</id></root>');
assert.equal(escapedXml.valid, true);
assert.match(escapedXml.formatted, /name="Sai"/);
assert.ok(escapedXml.formatted.includes('\n'));

const brokenXml = formatXmlBestEffort('<root><customer><id>123</id></root>');
assert.equal(brokenXml.valid, false);
assert.equal(brokenXml.bestEffort, true);
assert.ok(brokenXml.formatted.includes('\n'));
assert.match(brokenXml.repairNote, /best-effort/i);

console.log('All resilient JSON/XML formatting tests passed.');
