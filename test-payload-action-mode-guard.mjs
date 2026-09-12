import assert from 'node:assert/strict';
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

console.log('All payload action mode guard tests passed.');
