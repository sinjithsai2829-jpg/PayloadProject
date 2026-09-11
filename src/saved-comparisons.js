import {
  createComparisonSnapshot,
  parseComparisonSnapshot,
} from './comparison-file.js';
import {
  createPortableComparisonHtml,
  parsePortableComparisonHtml,
  portableComparisonDownloadName,
  PORTABLE_EXPORT_VERSION,
} from './portable-comparison-html-safe.js';

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const compareBtn = document.querySelector('#compareBtn');
const compareBar = document.querySelector('#compareBar');
const statusText = document.querySelector('#statusText');
const toolbarLeft = document.querySelector('.toolbar-left');
const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');

const saveBtn = document.createElement('button');
saveBtn.id = 'saveComparisonBtn';
saveBtn.textContent = 'Save comparison';
saveBtn.title = 'Download a browser-openable HTML file containing both payloads and the comparison view';

const openBtn = document.createElement('button');
openBtn.id = 'openComparisonBtn';
openBtn.textContent = 'Open comparison';
openBtn.title = 'Open a saved PayloadDiff HTML or legacy .payloaddiff comparison file';

const openInput = document.createElement('input');
openInput.id = 'openComparisonInput';
openInput.type = 'file';
openInput.accept = '.html,text/html,.payloaddiff,application/json';
openInput.className = 'hidden';

if (toolbarLeft) toolbarLeft.append(saveBtn, openBtn, openInput);

saveBtn.addEventListener('click', saveComparison);
openBtn.addEventListener('click', () => openInput.click());
openInput.addEventListener('change', openComparison);

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode || 'json';
}

function comparisonIsActive() {
  if (!compareBar || compareBar.classList.contains('hidden')) return false;
  return !!window.PayloadDiffCompareSession?.isActive?.();
}

function activeView(index) {
  return panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active') ? 'tree' : 'code';
}

function scrollState(element) {
  return { top: element?.scrollTop || 0, left: element?.scrollLeft || 0 };
}

function captureUiState() {
  return {
    views: [activeView(0), activeView(1)],
    panelNames: window.PayloadDiffPanelNames?.get?.() || ['File 1', 'File 2'],
    syncEnabled: syncInput?.checked ?? true,
    currentDiffIndex: window.PayloadDiffCompareSession?.getCurrentDiffIndex?.() ?? 0,
    codeScroll: editors.map((editor) => scrollState(editor)),
    treeScroll: panes.map((pane) => scrollState(pane.querySelector('.tree-view'))),
  };
}

function saveComparison() {
  if (!comparisonIsActive()) {
    setStatus('Run Compare before saving a comparison.', true);
    return;
  }

  try {
    const snapshot = createComparisonSnapshot({
      mode: currentMode(),
      left: editors[0]?.value || '',
      right: editors[1]?.value || '',
      ui: captureUiState(),
    });
    const html = createPortableComparisonHtml(snapshot);
    const filename = portableComparisonDownloadName();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(`Comparison saved as ${filename}. Double-click it to reopen the comparison in your default browser.`);
    log('info', 'comparison-file.saved', {
      format: 'portable-html',
      exportVersion: PORTABLE_EXPORT_VERSION,
      filename,
      htmlChars: html.length,
      mode: snapshot.mode,
      panelNames: snapshot.ui.panelNames,
      chars: [snapshot.payloads.left.length, snapshot.payloads.right.length],
      currentDiffIndex: snapshot.ui.currentDiffIndex,
    });
  } catch (error) {
    setStatus(error.message || 'Unable to save comparison.', true);
    log('error', 'comparison-file.save.failed', { error });
  }
}

async function openComparison(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    setStatus('Opening saved comparison…');
    const text = await file.text();
    const snapshot = file.name.toLowerCase().endsWith('.html') || /<script\s+id=["']payloaddiff-snapshot["']/i.test(text)
      ? parsePortableComparisonHtml(text)
      : parseComparisonSnapshot(text);
    await restoreSnapshot(snapshot);
    setStatus(`Saved ${snapshot.mode.toUpperCase()} comparison restored.`);
    log('info', 'comparison-file.opened', {
      filename: file.name,
      mode: snapshot.mode,
      panelNames: snapshot.ui.panelNames,
      chars: [snapshot.payloads.left.length, snapshot.payloads.right.length],
      currentDiffIndex: snapshot.ui.currentDiffIndex,
    });
  } catch (error) {
    setStatus(error.message || 'Unable to open comparison file.', true);
    log('error', 'comparison-file.open.failed', { error });
  }
}

async function restoreSnapshot(snapshot) {
  const modeBtn = document.querySelector(`.mode-btn[data-mode="${snapshot.mode}"]`);
  if (modeBtn && !modeBtn.classList.contains('active')) modeBtn.click();
  await frame();

  window.PayloadDiffPanelNames?.set?.(snapshot.ui.panelNames || ['File 1', 'File 2']);

  for (let index = 0; index < 2; index += 1) {
    const editor = editors[index];
    if (!editor) continue;
    editor.value = index === 0 ? snapshot.payloads.left : snapshot.payloads.right;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  if (syncInput && syncInput.checked !== snapshot.ui.syncEnabled) {
    syncInput.checked = snapshot.ui.syncEnabled;
    syncInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  for (let index = 0; index < 2; index += 1) panes[index]?.querySelector('.view-btn[data-view="code"]')?.click();
  await frame();

  compareBtn?.click();
  await waitForComparison(snapshot.mode);

  for (let index = 0; index < 2; index += 1) {
    const desired = snapshot.ui.views[index] === 'tree' ? 'tree' : 'code';
    const button = panes[index]?.querySelector(`.view-btn[data-view="${desired}"]`);
    if (button && !button.classList.contains('active')) button.click();
  }

  await frame();
  await frame();
  restoreScroll(snapshot.ui);
  await frame();
  restoreScroll(snapshot.ui);
}

function restoreScroll(ui) {
  for (let index = 0; index < 2; index += 1) {
    const code = ui.codeScroll[index];
    if (editors[index] && code) {
      editors[index].scrollTop = code.top || 0;
      editors[index].scrollLeft = code.left || 0;
    }
    const tree = panes[index]?.querySelector('.tree-view');
    const treeSaved = ui.treeScroll[index];
    if (tree && treeSaved) {
      tree.scrollTop = treeSaved.top || 0;
      tree.scrollLeft = treeSaved.left || 0;
    }
  }
}

async function waitForComparison(mode) {
  const started = performance.now();
  while (performance.now() - started < 30000) {
    const busy = document.body.classList.contains('busy');
    const visible = !!compareBar && !compareBar.classList.contains('hidden');
    const sessionReady = !!window.PayloadDiffCompareSession?.isActive?.();
    const sameMode = (window.PayloadDiffCompareSession?.getMode?.() || mode) === mode;
    if (!busy && visible && sessionReady && sameMode) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out while rebuilding the saved comparison.');
}

function frame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function setStatus(message, error = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle('error', error);
}

function log(level, type, data) {
  try { window.PayloadDiffDiagnostics?.log(level, type, data); } catch (_) {}
}
