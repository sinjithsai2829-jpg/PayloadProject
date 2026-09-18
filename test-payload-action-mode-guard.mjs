import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { detectActionPayloadMode } from './src/payload-action-mode-guard.js';

{
  const result = detectActionPayloadMode([{ paneIndex: 0, text: '<root><item>1</item></root>' }]);
  assert.equal(result.mode, 'xml');
  assert.equal(result.conflict, false);
}

{
  const result = detectActionPayloadMode([{ paneIndex: 0, text: '{"root":{"item":1}}' }]);
  assert.equal(result.mode, 'json');
  assert.equal(result.conflict, false);
}

{
  const result = detectActionPayloadMode([
    { paneIndex: 0, text: '<root><item>1</item></root>' },
    { paneIndex: 1, text: '<root><item>2</item></root>' },
  ]);
  assert.equal(result.mode, 'xml');
  assert.equal(result.conflict, false);
}

{
  const result = detectActionPayloadMode([
    { paneIndex: 0, text: '{"item":1}' },
    { paneIndex: 1, text: '{"item":2}' },
  ]);
  assert.equal(result.mode, 'json');
  assert.equal(result.conflict, false);
}

{
  const result = detectActionPayloadMode([
    { paneIndex: 0, text: '{"item":1}' },
    { paneIndex: 1, text: '<root><item>2</item></root>' },
  ]);
  assert.equal(result.mode, null);
  assert.equal(result.conflict, true);
}

{
  const result = detectActionPayloadMode([{ paneIndex: 0, text: 'ordinary text' }]);
  assert.equal(result.mode, null);
  assert.equal(result.conflict, false);
}

{
  const result = detectActionPayloadMode([{ paneIndex: 0, text: '{\\"item\\":1}' }]);
  assert.equal(result.mode, 'json');
  assert.equal(result.conflict, false);
}

{
  const result = detectActionPayloadMode([{ paneIndex: 0, text: '<root><item>1</root>' }]);
  assert.equal(result.mode, 'xml');
  assert.equal(result.conflict, false);
}

const guardSource = await readFile(new URL('./src/payload-action-mode-guard.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('./src/main.js', import.meta.url), 'utf8');
assert.ok(guardSource.includes("if (action === 'format')"), 'mixed payload types must not block pane-local formatting');
assert.ok(guardSource.includes('payload.action-mode-mixed-format'));
assert.ok(guardSource.includes('JSON and XML cannot be compared directly'));
assert.ok(mainSource.includes('formatPane(index, detectedPaneMode(index))'));
assert.ok(mainSource.includes('function detectedPaneMode(index)'));
assert.ok(mainSource.includes("detected.confidence >= 0.8"));

console.log('All payload action mode guard tests passed.');
