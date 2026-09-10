import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const live = await readFile(new URL('./src/editable-compare.js', import.meta.url), 'utf8');
const smoothWorker = await readFile(new URL('./src/smooth-worker.js', import.meta.url), 'utf8');
const sync = await readFile(new URL('./src/sync-scroll.js', import.meta.url), 'utf8');
const persistence = await readFile(new URL('./src/persistence.js', import.meta.url), 'utf8');
const editableCode = await readFile(new URL('./src/editable-code-surface.js', import.meta.url), 'utf8');
const enhancements = await readFile(new URL('./src/enhancements.js', import.meta.url), 'utf8');

// Regression: do not load the retired duplicate code-diff runtime.
assert.ok(boot.includes("./editable-compare.js"));
assert.ok(boot.includes("./sync-scroll.js"));
assert.ok(boot.includes("./persistence.js"));
assert.ok(boot.includes("./editable-code-surface.js"));
assert.ok(!boot.includes("./diff-display.js"));

// Regression: live editing must not trigger the heavyweight main Compare flow.
assert.ok(live.includes("./smooth-worker.js"));
assert.ok(!live.includes('compareBtn?.click()'));
assert.ok(!live.includes('compareBtn.click()'));
assert.ok(live.includes('220'));

// Runtime should use the single fast engine in one worker.
assert.ok(smoothWorker.includes("./fast-engine.js"));
assert.ok(smoothWorker.includes('compareJsonValues'));
assert.ok(smoothWorker.includes('attachPrettyJsonLineNumbers'));

// Paired-pane scrolling remains part of the active runtime and now works only
// with the canonical editable Code editor or Tree view.
assert.ok(sync.includes('Sync views & scroll'));
assert.ok(sync.includes("classList.contains('editor')"));
assert.ok(!sync.includes('virtual-code'));
assert.ok(!sync.includes('enhancement-edit'));

// Large view is intentionally removed. Enhancements keeps only tree search and
// synchronized tree navigation; it must not create/toggle a virtual Code view.
assert.ok(enhancements.includes('tree-search-worker.js'));
assert.ok(enhancements.includes('Sync tree navigation'));
assert.ok(!enhancements.includes('virtual-code'));
assert.ok(!enhancements.includes('enhancement-edit'));
assert.ok(!enhancements.includes('activateVirtual'));
assert.ok(!enhancements.includes('toggleVirtual'));
assert.ok(!enhancements.includes('View formatted'));
assert.ok(!enhancements.includes('Large view'));

// Editable Code is the canonical comparison surface and has line numbers.
assert.ok(editableCode.includes('editor-line-gutter'));
assert.ok(editableCode.includes('editor-line-number'));
assert.ok(editableCode.includes("editor.classList.remove('hidden')"));
assert.ok(!editableCode.includes('virtual-code'));
assert.ok(!editableCode.includes('enhancement-edit'));
assert.ok(!editableCode.includes('Large view'));

// Refresh persistence must support large payloads without storing them in
// localStorage. Payload text is kept in IndexedDB; only a per-tab session ID is
// stored in sessionStorage so a normal refresh restores the same tab.
assert.ok(persistence.includes('indexedDB.open'));
assert.ok(persistence.includes('sessionStorage'));
assert.ok(!persistence.includes('localStorage'));
assert.ok(persistence.includes('deleteCurrentSession'));
assert.ok(persistence.includes("clearBtn?.addEventListener('click'"));
assert.ok(persistence.includes("editor.dispatchEvent(new Event('input'"));
assert.ok(persistence.includes('STALE_AFTER_MS'));

console.log('All runtime wiring regression tests passed.');
