import assert from 'node:assert/strict';
import {
  normalizeJsonTransportInput,
  decodeOneTransportLayer,
  extractJsonDocumentWithWrapperTail,
} from './src/input-normalization.js';

const transported = String.raw`{\"orders\":[{\"description\":\"Earn MQD\\'s\",\"brand\":\"Delta One\\&#174; Classic\",\"screen\":\"Seatback Screen Size - 18\\\\\\\" FC\"}]}\"\n        }`;
const normalized = normalizeJsonTransportInput(transported);
assert.equal(normalized.repaired, true);
const parsed = JSON.parse(normalized.text);
assert.equal(parsed.orders[0].description, "Earn MQD's");
assert.equal(parsed.orders[0].brand, 'Delta One&#174; Classic');
assert.equal(parsed.orders[0].screen, 'Seatback Screen Size - 18" FC');
assert.match(normalized.repairNote, /transport layer/i);

const alreadyValid = '{"text":"18\\\" display","apostrophe":"MQD\'s"}';
const untouched = normalizeJsonTransportInput(alreadyValid);
assert.equal(untouched.repaired, false);
assert.equal(untouched.text, alreadyValid);

const oneLayer = decodeOneTransportLayer(String.raw`{\"x\":\"18\\\\\\\"\"}`);
assert.equal(oneLayer, '{"x":"18\\\""}');

const extracted = extractJsonDocumentWithWrapperTail('{"a":1}"\n }');
assert.ok(extracted);
assert.equal(extracted.document, '{"a":1}');
assert.equal(extracted.removedTail, true);

const unsafeTail = extractJsonDocumentWithWrapperTail('{"a":1} trailing-text');
assert.equal(unsafeTail, null);

console.log('All escaped JSON input normalization tests passed.');
