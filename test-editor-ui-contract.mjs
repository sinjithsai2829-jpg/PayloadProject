import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const boot = await fs.readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const enhancements = await fs.readFile(new URL('./src/enhancements.js', import.meta.url), 'utf8');
const wordWrap = await fs.readFile(new URL('./src/word-wrap.js', import.meta.url), 'utf8');
const xmlTree = await fs.readFile(new URL('./src/xml-tree-ui.js', import.meta.url), 'utf8');
const main = await fs.readFile(new URL('./src/main.js', import.meta.url), 'utf8');
const editableCode = await fs.readFile(new URL('./src/editable-code-surface.js', import.meta.url), 'utf8');
const theme = await fs.readFile(new URL('./src/theme-toggle.js', import.meta.url), 'utf8');
const selectAll = await fs.readFile(new URL('./src/huge-select-all-guard.js', import.meta.url), 'utf8');

// One canonical editor surface. Large payload protection must never replace it
// with a parallel UI that loses feature parity.
for (const forbidden of [
  './large-payload-view.js',
  './large-payload-controller.js',
  './large-payload-performance-guard.js',
  './large-payload-diff-overlay.js',
]) assert.ok(!boot.includes(forbidden), `${forbidden} must not be booted`);

assert.ok(main.includes('<textarea id="editor${index}" class="editor"'));
assert.ok(editableCode.includes('editor-line-gutter'));
assert.ok(editableCode.includes('editor-indent-guides'));

// Wrap remains available on the canonical Code surface.
assert.ok(boot.includes("./word-wrap.js"));
assert.ok(wordWrap.includes('word-wrap-toggle'));
assert.ok(wordWrap.includes('word-wrap-enabled'));

// Tree remains available for XML as well as JSON.
assert.ok(boot.includes("./xml-tree-ui.js"));
assert.ok(xmlTree.includes("document.querySelectorAll('.tree-tab').forEach((tab) => tab.classList.remove('hidden'))"));
assert.ok(xmlTree.includes('parseXmlTree') || xmlTree.includes('xml-tree-worker'));

// Search remains tied to the existing Code/Tree surfaces and must navigate to
// matches instead of updating only the counter.
assert.ok(enhancements.includes('searchCode(text, query, SEARCH_LIMIT)'));
assert.ok(enhancements.includes('revealCodeMatch(index, result.matches[0])'));
assert.ok(enhancements.includes('editor.setSelectionRange(match.start, match.end)'));
assert.ok(enhancements.includes('revealTreePath(index, result.paths[0], true)'));
assert.ok(enhancements.includes('search-hit'));

// Double click is left to the browser/editor. No production module opens a
// segment-edit modal from a canonical editor double click.
assert.ok(!boot.includes('large-payload-view'));
assert.ok(!enhancements.includes("addEventListener('dblclick'"));

// Theme is application-level; no large-payload surface may hard-code a dark UI.
assert.ok(boot.includes("./theme-toggle.js"));
assert.ok(theme.includes('payloaddiff:theme-changed'));

// Huge Select All is panel-scoped and never uses document.body/page selection.
assert.ok(selectAll.includes("target?.closest?.('.editor')"));
assert.ok(selectAll.includes('event.preventDefault()'));
assert.ok(selectAll.includes('editor.setSelectionRange(caret, caret'));
assert.ok(!selectAll.includes('window.getSelection'));
assert.ok(!selectAll.includes('document.execCommand'));
assert.ok(!selectAll.includes('selectNodeContents'));

// Selection protection is format neutral.
assert.ok(!selectAll.includes("mode === 'json'"));
assert.ok(!selectAll.includes("mode === 'xml'"));

console.log('All editor UI contract regression tests passed.');
