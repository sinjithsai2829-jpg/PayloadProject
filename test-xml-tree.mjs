import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseXmlTree } from './src/xml-tree.js';

const simple = parseXmlTree('<root><child id="1">value</child></root>');
assert.equal(simple.kind, 'xml-document');
assert.equal(simple.children.length, 1);
assert.equal(simple.children[0].name, 'root');
assert.equal(simple.children[0].children[0].name, 'child');
assert.equal(simple.children[0].children[0].attributes[0].name, 'id');
assert.equal(simple.children[0].children[0].children[0].value, 'value');

const lineMapped = parseXmlTree(`<?xml version="1.0"?>
<root>
  <group>
    <item id="a">A</item>
    <item id="b"><![CDATA[B]]></item>
  </group>
</root>`);
const root = lineMapped.children.find((node) => node.kind === 'element');
const group = root.children.find((node) => node.kind === 'element');
const items = group.children.filter((node) => node.kind === 'element');
assert.equal(root.lineStart, 2);
assert.equal(root.lineEnd, 7);
assert.equal(group.lineStart, 3);
assert.equal(group.lineEnd, 6);
assert.equal(items[0].lineStart, 4);
assert.equal(items[0].lineEnd, 4);
assert.equal(items[1].lineStart, 5);
assert.equal(items[1].lineEnd, 5);

const escaped = parseXmlTree('<root name=\\"Sai\\"><child>ok</child></root>'.replace(/\\+"/g, '"'));
assert.equal(escaped.children[0].attributes[0].value, 'Sai');

let invalidError = null;
try {
  parseXmlTree('<root><child></root>');
} catch (error) {
  invalidError = error;
}
assert.ok(invalidError instanceof Error);

// Large-tree smoke test: line mapping must remain indexed rather than rescanning
// from the start of the XML for every node.
const largeLines = ['<root>'];
for (let index = 0; index < 12000; index += 1) {
  largeLines.push(`  <item id="${index}">${index}</item>`);
}
largeLines.push('</root>');
const largeXml = largeLines.join('\n');
const started = performance.now();
const largeTree = parseXmlTree(largeXml);
const elapsedMs = performance.now() - started;
assert.equal(largeTree.children[0].lineStart, 1);
assert.equal(largeTree.children[0].lineEnd, 12002);
assert.equal(largeTree.children[0].children.filter((node) => node.kind === 'element').length, 12000);
// This threshold is deliberately generous for CI. The indexed implementation
// should be far below it, while the old repeated full-string scanning path is
// orders of magnitude slower on this input.
assert.ok(elapsedMs < 5000, `large XML Tree parse took ${Math.round(elapsedMs)} ms`);

const xmlTreeSource = await readFile(new URL('./src/xml-tree.js', import.meta.url), 'utf8');
const xmlWorkerSource = await readFile(new URL('./src/xml-tree-worker.js', import.meta.url), 'utf8');
assert.ok(xmlTreeSource.includes('buildLineStarts(text)'));
assert.ok(xmlTreeSource.includes('lineAt(lineStarts'));
assert.ok(!xmlTreeSource.includes('lineAt(text, gt)'));
// The worker may mention the old formatter in a comment explaining why it is
// intentionally avoided. Guard the executable dependency/call instead of a
// comment string so documentation edits cannot break CI.
assert.ok(!/import\s+\{[^}]*formatXmlBestEffort[^}]*\}\s+from/.test(xmlWorkerSource), 'Tree worker must not import the full XML formatter');
assert.ok(!/\bformatXmlBestEffort\s*\(/.test(xmlWorkerSource.replace(/\/\/.*$/gm, '')), 'Tree worker must not pretty-format the full XML a second time');
assert.ok(xmlWorkerSource.includes('normalizeEscapedXml(text)'));

console.log(`All XML Tree tests passed; 12k-node parse completed in ${Math.round(elapsedMs)} ms.`);
