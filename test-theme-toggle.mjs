import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const boot = await readFile(new URL('./src/boot.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('./src/theme-toggle.js', import.meta.url), 'utf8');
const saved = await readFile(new URL('./src/saved-comparisons.js', import.meta.url), 'utf8');
const comparison = await readFile(new URL('./src/comparison-file.js', import.meta.url), 'utf8');

assert.ok(boot.includes("./theme-toggle.js"));
assert.ok(theme.includes("const modeSwitch = document.querySelector('.mode-switch')"));
assert.ok(theme.includes('topbar-display-controls'));
assert.ok(theme.includes('themeToggleBtn'));
assert.ok(theme.includes("localStorage.getItem(STORAGE_KEY)"));
assert.ok(theme.includes("localStorage.setItem(STORAGE_KEY, next)"));
assert.ok(theme.includes('html[data-theme="light"]'));
assert.ok(theme.includes('.editor'));
assert.ok(theme.includes('.tree-view'));
assert.ok(theme.includes('.fold-code-view'));
assert.ok(theme.includes('.editor-diff-overlay'));
assert.ok(theme.includes('.syntax-error-line'));
assert.ok(saved.includes("theme: window.PayloadDiffTheme?.get?.() || 'dark'"));
assert.ok(saved.includes("window.PayloadDiffTheme?.set?.(snapshot.ui.theme || 'dark')"));
assert.ok(comparison.includes("theme: ui.theme === 'light' ? 'light' : 'dark'"));

console.log('All theme toggle regression tests passed.');
