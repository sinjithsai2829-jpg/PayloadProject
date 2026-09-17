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

// Real API/log payloads are sometimes a JSON string whose decoded value is the
// actual JSON document. Invalid source-language escapes such as \' may also be
// present in that outer transport layer. Formatting must repair the wrapper,
// unwrap it, and pretty-print the inner object instead of re-stringifying the
// inner document as one giant escaped line.
const doubleEncoded = JSON.stringify('{"orders":[{"description":"Earn MQD\\\'s","id":1}]}');
const doubleEncodedResult = formatJsonBestEffort(doubleEncoded);
assert.equal(doubleEncodedResult.valid, true);
assert.equal(doubleEncodedResult.bestEffort, false);
assert.ok(doubleEncodedResult.lineCount > 3);
assert.ok(!doubleEncodedResult.formatted.startsWith('"{\\"orders\\"'));
assert.equal(doubleEncodedResult.parsed.orders[0].description, "Earn MQD's");
assert.equal(doubleEncodedResult.parsed.orders[0].id, 1);

// Clean double-encoded JSON must follow the same unwrap path even without any
// repair being necessary.
const cleanDoubleEncoded = formatJsonBestEffort(JSON.stringify('{"a":1,"nested":{"b":2}}'));
assert.equal(cleanDoubleEncoded.valid, true);
assert.deepEqual(cleanDoubleEncoded.parsed, { a: 1, nested: { b: 2 } });
assert.ok(cleanDoubleEncoded.lineCount >= 5);

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

// JSON-string-wrapped XML gets the same transport recovery as JSON. The XML
// formatter intentionally puts element text on its own indented line, so assert
// the recovered value rather than coupling this test to one presentation layout.
const wrappedXml = formatXmlBestEffort(JSON.stringify('<root><message>Earn MQD\\\'s</message></root>'));
assert.equal(wrappedXml.valid, true);
assert.match(wrappedXml.formatted, /Earn MQD's/);
assert.ok(!wrappedXml.formatted.includes("MQD\\'s"));
assert.match(wrappedXml.formatted, /<message>/);
assert.match(wrappedXml.formatted, /<\/message>/);
assert.ok(wrappedXml.formatted.includes('\n'));

const brokenXml = formatXmlBestEffort('<root><customer><id>123</id></root>');
assert.equal(brokenXml.valid, false);
assert.equal(brokenXml.bestEffort, true);
assert.ok(brokenXml.formatted.includes('\n'));
assert.match(brokenXml.repairNote, /best-effort/i);

console.log('All resilient JSON/XML formatting tests passed.');
