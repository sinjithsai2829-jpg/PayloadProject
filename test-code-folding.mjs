import assert from 'node:assert/strict';
import { findFoldRanges, findJsonFoldRanges, findXmlFoldRanges } from './src/fold-ranges.js';

const json = `{
  "response": {
    "items": [
      {
        "id": 1
      },
      {
        "id": 2
      }
    ]
  },
  "flat": true
}`;

const jsonRanges = findJsonFoldRanges(json);
assert.deepEqual(jsonRanges.map(({ startLine, endLine, kind }) => ({ startLine, endLine, kind })), [
  { startLine: 1, endLine: 13, kind: 'object' },
  { startLine: 2, endLine: 11, kind: 'object' },
  { startLine: 3, endLine: 10, kind: 'array' },
  { startLine: 4, endLine: 6, kind: 'object' },
  { startLine: 7, endLine: 9, kind: 'object' },
]);
assert.deepEqual(findFoldRanges('json', json), jsonRanges);
assert.deepEqual(findJsonFoldRanges('{"oneLine":{"a":1}}'), []);

// Braces/brackets inside JSON strings must not create fold ranges.
const jsonWithStringBraces = `{
  "message": "literal { [ ] }",
  "nested": {
    "ok": true
  }
}`;
assert.deepEqual(findJsonFoldRanges(jsonWithStringBraces).map((range) => [range.startLine, range.endLine]), [
  [1, 6],
  [3, 5],
]);

const xml = `<response>
  <result id="1">
    <items>
      <item>
        <id>1</id>
      </item>
      <item />
    </items>
  </result>
</response>`;

const xmlRanges = findXmlFoldRanges(xml);
assert.deepEqual(xmlRanges.map(({ startLine, endLine, kind, name }) => ({ startLine, endLine, kind, name })), [
  { startLine: 1, endLine: 10, kind: 'element', name: 'response' },
  { startLine: 2, endLine: 9, kind: 'element', name: 'result' },
  { startLine: 3, endLine: 8, kind: 'element', name: 'items' },
  { startLine: 4, endLine: 6, kind: 'element', name: 'item' },
]);
assert.deepEqual(findFoldRanges('xml', xml), xmlRanges);

// Self-closing and same-line elements are not foldable because they do not hide
// any additional source lines.
assert.deepEqual(findXmlFoldRanges('<root><child /></root>'), []);

const xmlSpecial = `<root>
  <!--
    comment
  -->
  <![CDATA[
    some text
  ]]>
</root>`;
const specialRanges = findXmlFoldRanges(xmlSpecial);
assert.ok(specialRanges.some((range) => range.kind === 'element' && range.startLine === 1 && range.endLine === 8));
assert.ok(specialRanges.some((range) => range.kind === 'comment' && range.startLine === 2 && range.endLine === 4));
assert.ok(specialRanges.some((range) => range.kind === 'cdata' && range.startLine === 5 && range.endLine === 7));

console.log('All code folding tests passed.');
