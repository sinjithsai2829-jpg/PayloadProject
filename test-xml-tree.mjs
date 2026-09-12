import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseXmlTree, searchXmlTree } from './src/xml-tree.js';

const xml = `<?xml version="1.0"?>
<customer id="C-100" active="true">
  <name>Jane Doe</name>
  <address type="HOME">
    <city>Austin</city>
  </address>
  <policy policyNumber="POL-1" type="AUTO">
    <coverage name="Liability" limit="$100,000" />
    <coverage name="Collision" limit="$50,000" />
  </policy>
</customer>`;

const tree = parseXmlTree(xml);
assert.equal(tree.kind, 'xml-document');
assert.equal(tree.children.length, 1);

const customer = tree.children[0];
assert.equal(customer.name, 'customer');
assert.equal(customer.path, '$/customer[0]');
assert.equal(customer.lineStart, 2);
assert.equal(customer.lineEnd, 11);
assert.equal(customer.attributes.find((item) => item.name === 'id')?.value, 'C-100');
assert.equal(customer.attributes.find((item) => item.name === 'active')?.path, '$/customer[0]/@active');

const policy = customer.children.find((item) => item.kind === 'element' && item.name === 'policy');
assert.ok(policy);
assert.equal(policy.lineStart, 7);
assert.equal(policy.lineEnd, 10);
const coverages = policy.children.filter((item) => item.kind === 'element' && item.name === 'coverage');
assert.equal(coverages.length, 2);
assert.equal(coverages[0].path, '$/customer[0]/policy[0]/coverage[0]');
assert.equal(coverages[0].lineStart, 8);
assert.equal(coverages[1].path, '$/customer[0]/policy[0]/coverage[1]');
assert.equal(coverages[1].lineStart, 9);

const citySearch = searchXmlTree(tree, 'Austin');
assert.ok(citySearch.paths.some((path) => path.includes('/city[0]/#text[0]')));

const attributeSearch = searchXmlTree(tree, 'policyNumber');
assert.ok(attributeSearch.paths.includes('$/customer[0]/policy[0]/@policyNumber'));

const pathSearch = searchXmlTree(tree, '$/customer[0]/policy[0]');
assert.ok(pathSearch.paths.includes('$/customer[0]/policy[0]'));

assert.throws(() => parseXmlTree('<root><child></root>'), /Expected <\/child> but found <\/root>/);
assert.throws(() => parseXmlTree('<root a="broken></root>'), /not closed|quote/i);

// Large-tree regression: every node line lookup must use one precomputed line
// index. The former implementation scanned from character 0 for every element,
// which became effectively quadratic on 2-3 MB / 50k+ line XML payloads.
const largeLines = ['<root>'];
for (let index = 0; index < 12000; index += 1) {
  largeLines.push(`  <item id="${index}">value-${index}</item>`);
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
assert.ok(!xmlWorkerSource.includes('formatXmlBestEffort'), 'Tree worker must not pretty-format the full XML a second time');

console.log(`All XML Tree tests passed; 12k-node parse completed in ${Math.round(elapsedMs)} ms.`);
