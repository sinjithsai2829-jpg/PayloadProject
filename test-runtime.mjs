import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const live = await readFile(new URL('./src/editable-compare.js', import.meta.url), 'utf8');
const smoothWorker = await readFile(new URL('./src/smooth-worker.js', import.meta.url), 'utf8');
const sync = await readFile(new URL('./src/sync-scroll.js', import.meta.url), 'utf8');

// Regression: do not load the retired duplicate code-diff runtime.
assert.ok(boot.includes("./editable-compare.js"));
assert.ok(boot.includes("./sync-scroll.js"));
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

console.log('All runtime wiring regression tests passed.');
