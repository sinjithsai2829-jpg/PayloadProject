import assert from 'node:assert/strict';
import { detectPayloadMode } from './src/payload-detection.js';

const cases = [
  ['clean JSON object', '{"a":1}', 'json'],
  ['clean JSON array', '[{"a":1}]', 'json'],
  ['transport escaped JSON', '{\\"orders\\":[{\\"id\\":1}]}', 'json'],
  ['loose JSON with trailing comma', '{"a":1,}', 'json'],
  ['single quoted JSON-like object', "{'a':1}", 'json'],
  ['clean XML', '<root><item>1</item></root>', 'xml'],
  ['XML declaration', '<?xml version="1.0"?><root/>', 'xml'],
  ['malformed but recognizable XML', '<root><item>1</root>', 'xml'],
  ['XML comment then root', '<!-- note --><root/>', 'xml'],
];

for (const [label, text, expected] of cases) {
  const result = detectPayloadMode(text);
  assert.equal(result.mode, expected, `${label} should detect as ${expected}`);
  assert.ok(result.confidence >= 0.8, `${label} should be confidently detected`);
}

assert.equal(detectPayloadMode('just some ordinary text').mode, null);
assert.equal(detectPayloadMode('key=value&another=value').mode, null);

const jsonFile = detectPayloadMode('not enough to detect content', { filename: 'sample.json' });
assert.equal(jsonFile.mode, 'json');
assert.ok(jsonFile.confidence >= 0.6);

const xmlFile = detectPayloadMode('not enough to detect content', { mimeType: 'application/xml' });
assert.equal(xmlFile.mode, 'xml');
assert.ok(xmlFile.confidence >= 0.6);

console.log('All payload auto-detection tests passed.');
