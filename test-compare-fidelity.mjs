import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findDuplicateJsonKeys, jsonComparisonFidelityIssue } from './src/compare-fidelity.js';
import { compareTextPayloads } from './src/text-fallback-diff.js';

const duplicate = `{
  "pnrItinerary": {
    "eligibilityDesc": "CANCEL",
    "eligibilityDesc": "CANCEL-extra",
    "eligibility": true
  }
}`;
const baseline = `{
  "pnrItinerary": {
    "eligibilityDesc": "CANCEL",
    "eligibility": true
  }
}`;

const duplicates = findDuplicateJsonKeys(duplicate);
assert.equal(duplicates.length, 1, 'a duplicate key in one object must be detected');
assert.equal(duplicates[0].line, 4, 'duplicate key location should point at the second occurrence');

assert.equal(findDuplicateJsonKeys('{"left":{"id":1},"right":{"id":2}}').length, 0,
  'the same key in different objects is valid and must not be treated as duplicate');
assert.equal(findDuplicateJsonKeys('{"a":1,"nested":{"a":2,"a":3}}').length, 1,
  'duplicate tracking must be scoped to each object');
assert.equal(findDuplicateJsonKeys('{"a\\"b":1,"a\\"b":2}').length, 1,
  'escaped JSON property names must still be compared correctly');

const issue = jsonComparisonFidelityIssue(baseline, duplicate);
assert.ok(issue, 'duplicate keys must make structural comparison lossy');
assert.equal(issue.kind, 'duplicate-json-key');
assert.equal(issue.leftCount, 0);
assert.equal(issue.rightCount, 1);
assert.match(issue.reason, /discard earlier occurrences/i);

const lossless = compareTextPayloads({ mode: 'json', left: baseline, right: duplicate, reason: issue.reason });
assert.equal(lossless.comparisonKind, 'text');
assert.equal(lossless.fallback, true);
assert.ok(lossless.summary.added + lossless.summary.removed + lossless.summary.modified > 0,
  'the extra duplicate-key source line must remain visible as a difference');
assert.ok(lossless.diffs.some((diff) => diff.rightLine === 4 || diff.rightLine === 5),
  'lossless comparison must navigate to the extra line instead of dropping it');

const guard = await readFile(new URL('./src/compare-input-guard.js', import.meta.url), 'utf8');
const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('./src/worker.js', import.meta.url), 'utf8');
const smooth = await readFile(new URL('./src/smooth-worker.js', import.meta.url), 'utf8');

assert.ok(boot.includes("import './compare-input-guard.js'"), 'read-only compare guard must load at startup');
assert.ok(guard.includes('compare.editor-write-blocked'), 'blocked compare-time editor writes must be diagnosed');
assert.ok(guard.includes('compare.input-guard-finished'), 'compare guard must log before/after invariants');
assert.ok(guard.includes("window.dispatchEvent(new CustomEvent('payloaddiff:compare-input-mutated'"),
  'unexpected editor mutation must surface as an invariant violation');
assert.ok(!guard.includes("currentMode() === 'json'"), 'read-only compare behavior must not be JSON-only');
assert.ok(!guard.includes("currentMode() === 'xml'"), 'read-only compare behavior must not be XML-only');

for (const source of [worker, smooth]) {
  assert.ok(source.includes('jsonComparisonFidelityIssue'), 'both compare workers must protect duplicate JSON keys');
  assert.ok(source.includes('left: payload.left'), 'text fallback must compare the source text, not lossy serialized data');
  assert.ok(source.includes('right: payload.right'), 'text fallback must preserve the right-side source text');
}
assert.ok(worker.includes("mode: 'xml'"));
assert.ok(worker.includes('left: payload.left'));
assert.ok(smooth.includes('left: payload.left'));

console.log('All compare fidelity and non-destructive comparison tests passed.');
