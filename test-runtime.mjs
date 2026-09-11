import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const main = await readFile(new URL('./src/main.js', import.meta.url), 'utf8');
const live = await readFile(new URL('./src/editable-compare.js', import.meta.url), 'utf8');
const inlineDiff = await readFile(new URL('./src/inline-diff-highlights.js', import.meta.url), 'utf8');
const codeFolding = await readFile(new URL('./src/code-folding.js', import.meta.url), 'utf8');
const treeDiffNavigation = await readFile(new URL('./src/tree-diff-navigation.js', import.meta.url), 'utf8');
const smoothWorker = await readFile(new URL('./src/smooth-worker.js', import.meta.url), 'utf8');
const sync = await readFile(new URL('./src/sync-scroll.js', import.meta.url), 'utf8');
const persistence = await readFile(new URL('./src/persistence.js', import.meta.url), 'utf8');
const editableCode = await readFile(new URL('./src/editable-code-surface.js', import.meta.url), 'utf8');
const enhancements = await readFile(new URL('./src/enhancements.js', import.meta.url), 'utf8');
const scrollbarVisibility = await readFile(new URL('./src/scrollbar-visibility.js', import.meta.url), 'utf8');
const xmlTreeUi = await readFile(new URL('./src/xml-tree-ui.js', import.meta.url), 'utf8');
const xmlTreeWorker = await readFile(new URL('./src/xml-tree-worker.js', import.meta.url), 'utf8');
const treeSearchWorker = await readFile(new URL('./src/tree-search-worker.js', import.meta.url), 'utf8');

// Canonical runtime modules.
assert.ok(boot.includes("./editable-compare.js"));
assert.ok(boot.includes("./inline-diff-highlights.js"));
assert.ok(boot.includes("./code-folding.js"));
assert.ok(boot.includes("./tree-diff-navigation.js"));
assert.ok(boot.includes("./sync-scroll.js"));
assert.ok(boot.includes("./persistence.js"));
assert.ok(boot.includes("./editable-code-surface.js"));
assert.ok(boot.includes("./xml-tree-ui.js"));
assert.ok(!boot.includes("./diff-display.js"));

// Shared Code folding is available to JSON and XML. JSON detects object/array
// line ranges, XML detects element ranges, while projection/rendering and
// persistence are shared by both formats.
assert.ok(codeFolding.includes("mode === 'xml' ? findXmlFoldRanges(text) : findJsonFoldRanges(text)"));
assert.ok(codeFolding.includes('findJsonFoldRanges'));
assert.ok(codeFolding.includes('findXmlFoldRanges'));
assert.ok(codeFolding.includes('code-fold-toggle'));
assert.ok(codeFolding.includes('fold-row-toggle'));
assert.ok(codeFolding.includes('fold-code-view'));
assert.ok(codeFolding.includes('foldedRanges'));
assert.ok(codeFolding.includes('revealCurrentDifference'));
assert.ok(codeFolding.includes('syncInput?.checked'));
assert.ok(sync.includes("classList.contains('fold-code-view')"));
assert.ok(persistence.includes('PayloadDiffCodeFolding'));
assert.ok(persistence.includes('foldedRanges'));
assert.ok(scrollbarVisibility.includes('.fold-code-view'));

// Tree navigation must follow the selected comparison index rather than only
// recoloring the tree. JSON reveals the selected path/ancestors, while XML maps
// the selected diff line to the deepest XML node and scrolls it into view.
assert.ok(treeDiffNavigation.includes("window.addEventListener('payloaddiff:live-compare-updated'"));
assert.ok(treeDiffNavigation.includes('detail.currentDiffIndex'));
assert.ok(treeDiffNavigation.includes('revealJsonTreePath'));
assert.ok(treeDiffNavigation.includes('ensurePathRendered'));
assert.ok(treeDiffNavigation.includes("scrollIntoView({ block: 'center', behavior: 'smooth' })"));
assert.ok(treeDiffNavigation.includes('tree-diff-current'));
assert.ok(xmlTreeUi.includes('currentDiffLine'));
assert.ok(xmlTreeUi.includes('currentDiffPath'));
assert.ok(xmlTreeUi.includes('revealXmlDifference'));
assert.ok(xmlTreeUi.includes('findDeepestNodeChain'));
assert.ok(xmlTreeUi.includes('ensureChainVisible'));
assert.ok(xmlTreeUi.includes("scrollIntoView({ block: 'center', behavior: 'smooth' })"));
assert.ok(xmlTreeUi.includes('tree-diff-current'));

// XML Tree parity: Tree must be exposed for XML, built off-main-thread, lazily
// rendered, searchable, diff-aware, and allowed to participate in shared sync.
assert.ok(xmlTreeUi.includes("document.querySelectorAll('.tree-tab').forEach((tab) => tab.classList.remove('hidden'))"));
assert.ok(xmlTreeUi.includes("new URL('./xml-tree-worker.js'"));
assert.ok(xmlTreeUi.includes("childLimits: new Map([['$', 250]])"));
assert.ok(xmlTreeUi.includes('Show ${Math.min(250, remaining).toLocaleString()} more'));
assert.ok(xmlTreeUi.includes("event.detail?.mode !== 'xml'"));
assert.ok(xmlTreeUi.includes('xmlDiffClass'));
assert.ok(!xmlTreeUi.includes('stopImmediatePropagation'));
assert.ok(xmlTreeWorker.includes('parseXmlTree'));
assert.ok(xmlTreeWorker.includes('searchXmlTree'));

// Tree search is shared between formats. Only parsing/search semantics differ.
assert.ok(enhancements.includes("searchWorker.postMessage({ id, mode, text, query"));
assert.ok(enhancements.includes('Search XML element, attribute, path, or value'));
assert.ok(enhancements.includes("node.classList.remove('hidden')"));
assert.ok(!enhancements.includes("classList.toggle('hidden', !json)"));
assert.ok(treeSearchWorker.includes("mode === 'xml'"));
assert.ok(treeSearchWorker.includes('searchXmlTree'));
assert.ok(treeSearchWorker.includes('searchJsonTree'));

// Shared sync is application-level, not JSON-only.
assert.ok(sync.includes('Sync views & scroll'));
assert.ok(sync.includes("classList.contains('editor')"));
assert.ok(enhancements.includes('Sync views & scroll'));
assert.ok(!enhancements.includes("syncControl.classList.toggle('hidden', !json)"));

// Editing during an active comparison must not destroy the live session.
assert.ok(main.includes('PayloadDiffCompareSession'));
assert.ok(main.includes('payloaddiff:live-compare-updated'));
assert.ok(live.includes('activeMode'));
assert.ok(live.includes('compareLive'));
assert.ok(live.includes('comparison will refresh when ${activeMode.toUpperCase()} is valid'));
assert.ok(!live.includes('compareBtn?.click()'));
assert.ok(!live.includes('compareBtn.click()'));

// Invalid payloads pause live diff rendering/navigation without destroying the
// comparison session. This contract applies to JSON and XML.
assert.ok(live.includes('invalidSides'));
assert.ok(live.includes('hideOverlays()'));
assert.ok(live.includes("disableNavigatorForEditing('Paused')"));
assert.ok(live.includes('markInvalidPanes'));
assert.ok(smoothWorker.includes('invalidSides'));

// Exact changed text is highlighted inside the line, not only with a broad
// full-line band. The implementation consumes the shared comparison event and
// contains no JSON/XML mode gate, so it applies to both payload formats.
assert.ok(inlineDiff.includes('inline-diff-segment'));
assert.ok(inlineDiff.includes('changedRange(left, right)'));
assert.ok(inlineDiff.includes("window.addEventListener('payloaddiff:live-compare-updated'"));
assert.ok(inlineDiff.includes("kind === 'replacement' ? 'removed' : 'modified'"));
assert.ok(inlineDiff.includes("kind === 'replacement' ? 'added' : 'modified'"));
assert.ok(!inlineDiff.includes("mode === 'json'"));
assert.ok(!inlineDiff.includes("mode === 'xml'"));

// Both panes retain visible scrollbars even when synchronized.
assert.ok(scrollbarVisibility.includes('Both panes always keep a visible scrollbar'));
assert.ok(!scrollbarVisibility.includes('scrollbar-width: none'));
assert.ok(!scrollbarVisibility.includes('::-webkit-scrollbar {\n    width: 0'));

// Large view stays retired.
assert.ok(!enhancements.includes('virtual-code'));
assert.ok(!enhancements.includes('enhancement-edit'));
assert.ok(!enhancements.includes('activateVirtual'));
assert.ok(!enhancements.includes('toggleVirtual'));
assert.ok(!enhancements.includes('View formatted'));
assert.ok(!enhancements.includes('Large view'));

// Editable Code remains canonical and line-numbered.
assert.ok(editableCode.includes('editor-line-gutter'));
assert.ok(editableCode.includes('editor-line-number'));
assert.ok(editableCode.includes("editor.classList.remove('hidden')"));
assert.ok(!editableCode.includes('virtual-code'));

// JSON and XML Code views share indentation/scope guides. The implementation is
// format-agnostic and renders only visible lines so 50k+ line payloads do not
// create a DOM node for every guide in the document.
assert.ok(editableCode.includes('editor-indent-guides'));
assert.ok(editableCode.includes('editor-indent-guide'));
assert.ok(editableCode.includes('renderIndentGuides(index)'));
assert.ok(editableCode.includes('leadingIndentColumns'));
assert.ok(editableCode.includes('inferIndentUnit'));
assert.ok(editableCode.includes('metrics.first'));
assert.ok(editableCode.includes('metrics.last'));
assert.ok(!editableCode.includes("mode === 'json'"));
assert.ok(!editableCode.includes("mode === 'xml'"));

// Clear fully resets stale comparison navigation.
assert.ok(main.includes("els.compareSummary.innerHTML = ''"));
assert.ok(main.includes("els.diffPosition.textContent = '0 of 0'"));
assert.ok(main.includes('els.prevDiff.disabled = true'));
assert.ok(main.includes('els.nextDiff.disabled = true'));

// Large-payload refresh persistence remains IndexedDB-based and deduplicated.
assert.ok(persistence.includes('indexedDB.open'));
assert.ok(persistence.includes('sessionStorage'));
assert.ok(!persistence.includes('localStorage'));
assert.ok(persistence.includes('deleteCurrentSession'));
assert.ok(!persistence.includes("editor?.addEventListener('scroll'"));
assert.ok(persistence.includes('lastSavedSignature'));
assert.ok(persistence.includes('stateSignature(record)'));
assert.ok(persistence.includes("addEventListener('pagehide'"));
assert.ok(persistence.includes('saveNow({ force: true })'));

console.log('All runtime wiring regression tests passed.');
