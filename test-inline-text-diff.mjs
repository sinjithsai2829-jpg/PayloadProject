import assert from 'node:assert/strict';
import { inlineDiffRanges } from './src/inline-text-diff.js';

const jsonLeft = '  "name": "Alice Smith", "status": "ACTIVE"';
const jsonRight = '  "name": "Alicia Smith", "status": "PAUSED"';
const json = inlineDiffRanges(jsonLeft, jsonRight);
assert.ok(json.left.length >= 2, 'separate JSON word changes should not collapse into one giant range');
assert.ok(json.right.length >= 2);
assert.ok(json.left.every((range) => range.end > range.start));
assert.ok(json.right.every((range) => range.end > range.start));
assert.ok(json.left[0].start > 0, 'unchanged JSON prefix should remain unhighlighted');

const xmlLeft = '<item code="ABC">old value</item>';
const xmlRight = '<item code="AXC">new value</item>';
const xml = inlineDiffRanges(xmlLeft, xmlRight);
assert.equal(xml.left.length, 2);
assert.equal(xml.right.length, 2);
assert.deepEqual(xml.left.map((range) => xmlLeft.slice(range.start, range.end)), ['B', 'old']);
assert.deepEqual(xml.right.map((range) => xmlRight.slice(range.start, range.end)), ['X', 'new']);

const unicodeLeft = 'name="José 😀"';
const unicodeRight = 'name="Jose 😃"';
const unicode = inlineDiffRanges(unicodeLeft, unicodeRight);
assert.deepEqual(unicode.left.map((range) => unicodeLeft.slice(range.start, range.end)), ['é', '😀']);
assert.deepEqual(unicode.right.map((range) => unicodeRight.slice(range.start, range.end)), ['e', '😃']);

assert.deepEqual(inlineDiffRanges('same', 'same'), { left: [], right: [] });

console.log('All shared word/character inline diff tests passed.');
