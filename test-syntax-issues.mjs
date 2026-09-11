import assert from 'node:assert/strict';
import {
  detectPayloadIssues,
  detectJsonIssues,
  detectXmlIssues,
  lineColumnFromOffset,
} from './src/syntax-issues.js';

assert.deepEqual(detectJsonIssues('{"ok":true,"items":[1,2]}'), []);
assert.deepEqual(detectXmlIssues('<root><item id="1">ok</item></root>'), []);

const badEscape = String.raw`{
  "name": "Earn MQD\'s",
  "active": true
}`;
const badEscapeIssues = detectPayloadIssues({ mode: 'json', text: badEscape });
assert.ok(badEscapeIssues.length >= 1);
assert.ok(badEscapeIssues.some((issue) => issue.code === 'json-invalid-escape'));
assert.ok(badEscapeIssues.some((issue) => issue.line === 2));

const trailingComma = `{
  "a": 1,
}`;
const trailingIssues = detectJsonIssues(trailingComma);
assert.ok(trailingIssues.some((issue) => issue.code === 'json-trailing-comma' && issue.line === 2));

const missingJsonClose = `{
  "a": [1, 2
}`;
const missingJsonIssues = detectJsonIssues(missingJsonClose);
assert.ok(missingJsonIssues.some((issue) => issue.code === 'json-mismatched-close' || issue.code === 'json-missing-close'));

const mismatchedXml = `<root>
  <customer>
    <name>Jane</name>
  </order>
</root>`;
const xmlIssues = detectPayloadIssues({ mode: 'xml', text: mismatchedXml });
assert.ok(xmlIssues.length >= 1);
assert.ok(xmlIssues.some((issue) => issue.code === 'xml-mismatched-close' && issue.line === 4));

const missingXmlClose = `<root>
  <customer>
    <name>Jane</name>
</root>`;
const missingXmlIssues = detectXmlIssues(missingXmlClose);
assert.ok(missingXmlIssues.some((issue) => issue.code === 'xml-mismatched-close' || issue.code === 'xml-missing-close'));

for (const issue of [...badEscapeIssues, ...trailingIssues, ...missingJsonIssues, ...xmlIssues, ...missingXmlIssues]) {
  assert.ok(Number.isInteger(issue.line) && issue.line >= 1);
  assert.ok(Number.isInteger(issue.column) && issue.column >= 1);
  assert.ok(Number.isInteger(issue.offset) && issue.offset >= 0);
  assert.ok(issue.message.length > 0);
}

assert.deepEqual(lineColumnFromOffset('one\ntwo\nthree', 6), { line: 2, column: 3 });

console.log('All syntax issue location tests passed.');
