import assert from 'node:assert/strict';
import {
  MAX_DIAGNOSTIC_EVENTS,
  createDiagnosticEvent,
  sanitizeDiagnosticString,
  sanitizeDiagnosticValue,
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
  content: xmlPayload,
  message: 'Invalid JSON at line 12 column 4',
  chars: 12345,
});
assert.equal(nested.payload, '[redacted]');
assert.equal(nested.content, '[redacted]');
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

console.log('PASS: diagnostics redact payload content and retain useful metadata.');
console.log(`PASS: diagnostics history is capped at ${MAX_DIAGNOSTIC_EVENTS} events.`);
