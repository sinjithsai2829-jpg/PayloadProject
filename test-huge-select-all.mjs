import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  HUGE_SELECT_ALL_THRESHOLD_CHARS,
  shouldVirtualizeSelectAll,
  isSelectAllShortcut,
  replacementForBeforeInput,
} from './src/huge-select-all-guard.js';

const boot = await fs.readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const guard = await fs.readFile(new URL('./src/huge-select-all-guard.js', import.meta.url), 'utf8');

assert.equal(HUGE_SELECT_ALL_THRESHOLD_CHARS, 256 * 1024);
assert.equal(shouldVirtualizeSelectAll(HUGE_SELECT_ALL_THRESHOLD_CHARS - 1), false);
assert.equal(shouldVirtualizeSelectAll(HUGE_SELECT_ALL_THRESHOLD_CHARS), true);
assert.equal(shouldVirtualizeSelectAll(2_689_513), true);
assert.equal(shouldVirtualizeSelectAll('x'.repeat(300_000)), true);

assert.equal(isSelectAllShortcut({ key: 'a', metaKey: true }), true);
assert.equal(isSelectAllShortcut({ key: 'A', ctrlKey: true }), true);
assert.equal(isSelectAllShortcut({ key: 'a', ctrlKey: true, altKey: true }), false);
assert.equal(isSelectAllShortcut({ key: 'c', metaKey: true }), false);

for (const inputType of [
  'deleteContentBackward',
  'deleteContentForward',
  'deleteByCut',
  'deleteWordBackward',
]) {
  assert.equal(replacementForBeforeInput(inputType), '');
}
assert.equal(replacementForBeforeInput('insertText', 'x'), 'x');
assert.equal(replacementForBeforeInput('insertReplacementText', '<root/>'), '<root/>');
assert.equal(replacementForBeforeInput('insertLineBreak'), '\n');
assert.equal(replacementForBeforeInput('historyUndo'), null);

// Guard must boot immediately after core state and before every legacy editor
// enhancement so Cmd/Ctrl+A is intercepted before the browser/default handlers.
const mainPos = boot.indexOf("import './main.js'");
const guardPos = boot.indexOf("import './huge-select-all-guard.js'");
const enhancementsPos = boot.indexOf("import './enhancements.js'");
const wordWrapPos = boot.indexOf("import './word-wrap.js'");
const foldingPos = boot.indexOf("import './code-folding.js'");
assert.ok(mainPos >= 0 && guardPos > mainPos);
assert.ok(guardPos < enhancementsPos);
assert.ok(guardPos < wordWrapPos);
assert.ok(guardPos < foldingPos);

// This fix is deliberately payload-type neutral. No JSON/XML branching belongs
// in selection handling: native selection cost depends on document size/layout.
assert.ok(!guard.includes("mode === 'json'"));
assert.ok(!guard.includes("mode === 'xml'"));
assert.ok(guard.includes("event.preventDefault()"));
assert.ok(guard.includes("event.stopImmediatePropagation()"));
assert.ok(guard.includes('editor.setSelectionRange(caret, caret'));
assert.ok(guard.includes("fileInput.value = ''"));
assert.ok(guard.includes('large-payload.virtual-select-all-cleared'));

console.log('All huge select-all responsiveness tests passed.');
