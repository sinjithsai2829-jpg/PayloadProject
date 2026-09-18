import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const main = await readFile(new URL('./src/main.js', import.meta.url), 'utf8');
const live = await readFile(new URL('./src/editable-compare.js', import.meta.url), 'utf8');
const inlineDiff = await readFile(new URL('./src/inline-diff-highlights.js', import.meta.url), 'utf8');
const codeFolding = await readFile(new URL('./src/code-folding.js', import.meta.url), 'utf8');
const foldRanges = await readFile(new URL('./src/fold-ranges.js', import.meta.url), 'utf8');
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
const viewSurface = await readFile(new URL('./src/view-surface-coordinator.js', import.meta.url), 'utf8');

assert.ok(indexHtml.includes('href="./src/style.css"'));
assert.ok(indexHtml.includes('src="./src/boot.js"'));
assert.ok(!main.includes("import './style.css'"), 'static hosting must load CSS from index.html rather than a JS module import');

assert.ok(boot.includes("./view-surface-coordinator.js"));
assert.ok(boot.includes("./editable-compare.js"));
assert.ok(boot.includes("./inline-diff-highlights.js"));
assert.ok(boot.includes("./code-folding.js"));
assert.ok(boot.includes("./tree-diff-navigation.js"));
assert.ok(boot.includes("./sync-scroll.js"));
assert.ok(boot.includes("./persistence.js"));
assert.ok(boot.includes("./editable-code-surface.js"));
assert.ok(boot.includes("./xml-tree-ui.js"));
assert.ok(!boot.includes("./diff-display.js"));

assert.ok(viewSurface.includes('MutationObserver'));
assert.ok(viewSurface.includes('tree-surface-active'));
assert.ok(viewSurface.includes('code-surface-active'));
assert.ok(viewSurface.includes('> .fold-code-view'));
assert.ok(viewSurface.includes('> .code-fold-gutter'));
assert.ok(viewSurface.includes('> .editor-line-gutter'));
assert.ok(viewSurface.includes('> .editor-indent-guides'));
assert.ok(viewSurface.includes('> .editor-diff-overlay'));
assert.ok(viewSurface.includes('> .inline-diff-layer'));
assert.ok(viewSurface.includes('> .syntax-line-layer'));
assert.ok(viewSurface.includes('> .syntax-error-rail'));
assert.ok(viewSurface.includes('> .tree-view'));
assert.ok(!viewSurface.includes("mode === 'json'"));
assert.ok(!viewSurface.includes("mode === 'xml'"));

// Folding structure detection was extracted from the renderer. Verify the
// renderer consumes the shared parser and that the shared parser preserves
// JSON/XML parity, rather than asserting implementation text lives in one file.
assert.ok(codeFolding.includes("import { findFoldRanges } from './fold-ranges.js'"));
assert.ok(codeFolding.includes('findFoldRanges(currentMode(), editor.value)'));
assert.ok(foldRanges.includes("mode === 'xml' ? findXmlFoldRanges(text) : findJsonFoldRanges(text)"));
assert.ok(foldRanges.includes('findJsonFoldRanges'));
assert.ok(foldRanges.includes('findXmlFoldRanges'));
assert.ok(codeFolding.includes('code-fold-toggle'));
assert.ok(codeFolding.includes('fold-row-toggle'));
assert.ok(codeFolding.includes('fold-code-view'));
assert.ok(codeFolding.includes('foldedRanges'));
assert.ok(codeFolding.includes('revealCurrentDifference'));
assert.ok(codeFolding.includes('Navigation must never destroy a user\'s fold choices'));
assert.ok(!codeFolding.includes('state.collapsed.delete(startLine)'), 'diff navigation must not expand user folds');
assert.ok(codeFolding.includes('syncInput?.checked'));
assert.ok(sync.includes("classList.contains('fold-code-view')"));
assert.ok(persistence.includes('PayloadDiffCodeFolding'));
assert.ok(persistence.includes('foldedRanges'));
assert.ok(scrollbarVisibility.includes('.fold-code-view'));

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

assert.ok(xmlTreeUi.includes("document.querySelectorAll('.tree-tab').forEach((tab) => tab.classList.remove('hidden'))"));
assert.ok(xmlTreeUi.includes("new URL('./xml-tree-worker.js'"));
assert.ok(xmlTreeUi.includes("childLimits: new Map([['$', 250]])"));
assert.ok(xmlTreeUi.includes('Show ${Math.min(250, remaining).toLocaleString()} more'));
assert.ok(xmlTreeUi.includes("event.detail?.mode !== 'xml'"));
assert.ok(xmlTreeUi.includes('xmlDiffClass'));
assert.ok(!xmlTreeUi.includes('stopImmediatePropagation'));
assert.ok(xmlTreeWorker.includes('parseXmlTree'));
assert.ok(xmlTreeWorker.includes('searchXmlTree'));

assert.ok(enhancements.includes('activeSearchSurface(index)'));
assert.ok(enhancements.includes("surface === 'code'"));
assert.ok(enhancements.includes('searchCode(text, query, SEARCH_LIMIT)'));
assert.ok(enhancements.includes('revealCodeMatch(index'));
assert.ok(enhancements.includes('revealTreePath(index'));
assert.ok(enhancements.includes('Search ${mode} Tree'));
assert.ok(enhancements.includes('Search ${mode} Code'));
assert.ok(enhancements.includes("searchWorker.postMessage({ id, mode, text, query"));
assert.ok(enhancements.includes("if (activeSearchSurface(index) !== 'tree') return"));
assert.ok(enhancements.includes("if (activeSearchSurface(other) !== 'tree') return"));
assert.ok(!enhancements.includes("treeTab.click()"));
assert.ok(!enhancements.includes("otherTreeTab.click()"));
assert.ok(treeSearchWorker.includes("mode === 'xml'"));
assert.ok(treeSearchWorker.includes('searchXmlTree'));
assert.ok(treeSearchWorker.includes('searchJsonTree'));

assert.ok(sync.includes('Sync views & scroll'));
assert.ok(sync.includes("classList.contains('editor')"));
assert.ok(enhancements.includes('Sync views & scroll'));
assert.ok(!enhancements.includes("syncControl.classList.toggle('hidden', !json)"));

assert.ok(main.includes('PayloadDiffCompareSession'));
assert.ok(main.includes('payloaddiff:live-compare-updated'));
assert.ok(main.includes('await session.start()'), 'Compare must delegate to the single live comparison owner');
assert.ok(!boot.includes("./compare-input-guard.js"), 'obsolete compare write guard must not be booted');
assert.ok(!live.includes("publishSelectionChange('viewport')"), 'scrolling must not continuously change the selected difference');
assert.ok(live.includes("publishSelectionChange('click')"), 'direct line clicks may explicitly change selection');
assert.ok(live.includes('activeMode'));
assert.ok(live.includes('compareLive'));
assert.ok(live.includes('comparison will refresh when ${activeMode.toUpperCase()} is valid'));
assert.ok(!live.includes('compareBtn?.click()'));
assert.ok(!live.includes('compareBtn.click()'));

assert.ok(live.includes('invalidSides'));
assert.ok(live.includes('hideOverlays()'));
assert.ok(live.includes("disableNavigatorForEditing('Paused')"));
assert.ok(live.includes('markInvalidPanes'));
assert.ok(smoothWorker.includes('invalidSides'));

assert.ok(inlineDiff.includes('inline-diff-segment'));
assert.ok(inlineDiff.includes('changedRange(left, right)'));
assert.ok(inlineDiff.includes("window.addEventListener('payloaddiff:live-compare-updated'"));
assert.ok(inlineDiff.includes("kind === 'replacement' ? 'removed' : 'modified'"));
assert.ok(inlineDiff.includes("kind === 'replacement' ? 'added' : 'modified'"));
assert.ok(!inlineDiff.includes("mode === 'json'"));
assert.ok(!inlineDiff.includes("mode === 'xml'"));

assert.ok(scrollbarVisibility.includes('.pd-scrollbar-rail'));
assert.ok(scrollbarVisibility.includes("scheduleUpdate(index, 'layout-settled')"), 'scrollbar geometry must retry after layout settles');
assert.ok(scrollbarVisibility.includes('scrollbar-gutter: stable'));
assert.ok(scrollbarVisibility.includes('::-webkit-scrollbar'));
assert.ok(!scrollbarVisibility.includes('scrollbar-width: none'));

assert.ok(!enhancements.includes('virtual-code'));
assert.ok(!enhancements.includes('enhancement-edit'));
assert.ok(!enhancements.includes('activateVirtual'));
assert.ok(!enhancements.includes('toggleVirtual'));
assert.ok(!enhancements.includes('View formatted'));
assert.ok(!enhancements.includes('Large view'));
assert.ok(!boot.includes('./large-payload-view.js'));
assert.ok(!boot.includes('./large-payload-controller.js'));

assert.ok(editableCode.includes('editor-line-gutter'));
assert.ok(editableCode.includes('editor-line-number'));
assert.ok(editableCode.includes("editor.classList.remove('hidden')"));
assert.ok(!editableCode.includes('virtual-code'));
assert.ok(editableCode.includes('editor-indent-guides'));
assert.ok(editableCode.includes('editor-indent-guide'));
assert.ok(editableCode.includes('renderIndentGuides(index)'));
assert.ok(editableCode.includes('leadingIndentColumns'));
assert.ok(editableCode.includes('inferIndentUnit'));
assert.ok(editableCode.includes('metrics.first'));
assert.ok(editableCode.includes('metrics.last'));
assert.ok(!editableCode.includes("mode === 'json'"));
assert.ok(!editableCode.includes("mode === 'xml'"));

assert.ok(main.includes("els.compareSummary.innerHTML = ''"));
assert.ok(main.includes("els.diffPosition.textContent = '0 of 0'"));
assert.ok(main.includes('els.prevDiff.disabled = true'));
assert.ok(main.includes('els.nextDiff.disabled = true'));

assert.ok(persistence.includes('indexedDB.open'));
assert.ok(persistence.includes('sessionStorage'));
assert.ok(!persistence.includes('localStorage'));
assert.ok(persistence.includes('deleteCurrentSession'));
assert.ok(!persistence.includes("editor?.addEventListener('scroll'"));
assert.ok(persistence.includes('let revision = 0'));
assert.ok(persistence.includes('let savedRevision = 0'));
assert.ok(persistence.includes('requestIdleCallback'));
assert.ok(persistence.includes('revisionAtCapture'));
assert.ok(!persistence.includes('stateSignature'));
assert.ok(persistence.includes("addEventListener('pagehide'"));
assert.ok(persistence.includes('saveNow({ force: true })'));

console.log('All runtime wiring regression tests passed.');
