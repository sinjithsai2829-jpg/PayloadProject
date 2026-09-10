import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const live = await readFile(new URL('./src/editable-compare.js', import.meta.url), 'utf8');
const smoothWorker = await readFile(new URL('./src/smooth-worker.js', import.meta.url), 'utf8');
const sync = await readFile(new URL('./src/sync-scroll.js', import.meta.url), 'utf8');
const persistence = await readFile(new URL('./src/persistence.js', import.meta.url), 'utf8');

// Regression: do not load the retired duplicate code-diff runtime.
assert.ok(boot.includes("./editable-compare.js"));
assert.ok(boot.includes("./sync-scroll.js"));
assert.ok(boot.includes("./persistence.js"));
assert.ok(!boot.includes("./diff-display.js"));

// Regression: live editing must not trigger the heavyweight main Compare flow.
assert.ok(live.includes("./smooth-worker.js"));
assert.ok(!live.includes('compareBtn?.click()'));
assert.ok(!live.includes('compareBtn.click()'));
assert.ok(live.includes('220'));

// Regression: half-typed invalid JSON keeps the last successful comparison.
assert.ok(live.includes('Keep last good comparison visible') || live.includes('last-good highlights'));
assert.ok(live.includes('comparison will refresh when JSON is valid'));

// Runtime should use the single fast engine in one worker.
assert.ok(smoothWorker.includes("./fast-engine.js"));
assert.ok(smoothWorker.includes('compareJsonValues'));
assert.ok(smoothWorker.includes('attachPrettyJsonLineNumbers'));

// Paired-pane scrolling remains part of the active runtime.
assert.ok(sync.includes('Sync views & scroll'));
assert.ok(sync.includes('visibleCodeScroller'));

// Refresh persistence must support large payloads without storing them in
// localStorage. Payload text is kept in IndexedDB; only a per-tab session ID is
// stored in sessionStorage so a normal refresh restores the same tab.
assert.ok(persistence.includes('indexedDB.open'));
assert.ok(persistence.includes('sessionStorage'));
assert.ok(!persistence.includes('localStorage'));
assert.ok(persistence.includes('deleteCurrentSession'));
assert.ok(persistence.includes("clearBtn?.addEventListener('click'"));
assert.ok(persistence.includes('editor.dispatchEvent(new Event(\'input\''));
assert.ok(persistence.includes('STALE_AFTER_MS'));

console.log('All runtime wiring regression tests passed.');
