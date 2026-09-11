import assert from 'node:assert/strict';
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
assert.equal(customer.attributes.find((item) => item.name === 'id')?.value, 'C-100');
assert.equal(customer.attributes.find((item) => item.name === 'active')?.path, '$/customer[0]/@active');

const policy = customer.children.find((item) => item.kind === 'element' && item.name === 'policy');
assert.ok(policy);
const coverages = policy.children.filter((item) => item.kind === 'element' && item.name === 'coverage');
assert.equal(coverages.length, 2);
assert.equal(coverages[0].path, '$/customer[0]/policy[0]/coverage[0]');
assert.equal(coverages[1].path, '$/customer[0]/policy[0]/coverage[1]');

const citySearch = searchXmlTree(tree, 'Austin');
assert.ok(citySearch.paths.some((path) => path.includes('/city[0]/#text[0]')));

const attributeSearch = searchXmlTree(tree, 'policyNumber');
assert.ok(attributeSearch.paths.includes('$/customer[0]/policy[0]/@policyNumber'));

const pathSearch = searchXmlTree(tree, '$/customer[0]/policy[0]');
assert.ok(pathSearch.paths.includes('$/customer[0]/policy[0]'));

assert.throws(() => parseXmlTree('<root><child></root>'), /Expected <\/child> but found <\/root>/);
assert.throws(() => parseXmlTree('<root a="broken></root>'), /not closed|quote/i);

console.log('All XML Tree tests passed.');
