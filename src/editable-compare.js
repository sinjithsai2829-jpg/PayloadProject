import { buildDiffLineIndex, nearestDiffIndexForLine, visibleCenterLine, lineFromClientY } from './diff-navigation.js';

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const compareBtn = document.querySelector('#compareBtn');
const clearBtn = document.querySelector('#clearBtn');
const compareBar = document.querySelector('#compareBar');
const compareSummary = document.querySelector('#compareSummary');
const diffPosition = document.querySelector('#diffPosition');
const firstDiff = document.querySelector('#firstDiff');
const prevDiff = document.querySelector('#prevDiff');
const nextDiff = document.querySelector('#nextDiff');
const lastDiff = document.querySelector('#lastDiff');
const statusText = document.querySelector('#statusText');

let compareActive = false;
let activeMode = 'json';
let liveTimer = 0;
let workerSeq = 0;
let latestRequest = 0;
let currentDiffIndex = 0;
let orderedDiffs = [];
let lastGoodSummary = null;
let lastGoodElapsed = 0;
let invalidSides = [];
let scrollTrackFrame = 0;
let pendingScrollPane = 0;
let suppressScrollTrackingUntil = 0;
let userScrollPane = -1;
let userScrollPaneUntil = 0;
const workerPending = new Map();
const diffsByPane = [[], []];
const diffLinesByPane = [[], []];

window.PayloadDiffCompareSession = {
  isActive: () => compareActive,
  getMode: () => activeMode,
  getInvalidSides: () => invalidSides.map((item) => ({ ...item })),
  getCurrentDiffIndex: () => currentDiffIndex,
  getDiffCount: () => orderedDiffs.length,
  goToFirst: () => selectAbsoluteDiff(0),
  goToLast: () => selectAbsoluteDiff(Math.max(0, orderedDiffs.length - 1)),
};

const worker = new Worker(new URL('./smooth-worker.js', import.meta.url), { type: 'module' });
worker.onmessage = ({ data }) => {
  const pending = workerPending.get(data.id);
  if (!pending) return;
  workerPending.delete(data.id);
  if (data.ok) pending.resolve(data.result);
  else {
    const error = new Error(data.error || 'Comparison failed');
    error.invalidSides = Array.isArray(data.invalidSides) ? data.invalidSides : [];
    pending.reject(error);
  }
};

function runLiveCompare(mode, left, right) {
  return new Promise((resolve, reject) => {
    const id = ++workerSeq;
    workerPending.set(id, { resolve, reject });
    worker.postMessage({ id, task: 'compareLive', payload: { mode, left, right } });
  });
}

installStyles();
const overlays = editors.map((editor, index) => createOverlay(editor, index));

function installStyles() {
  if (document.querySelector('#editable-compare-styles')) return;
  const style = document.createElement('style');
  style.id = 'editable-compare-styles';
  style.textContent = `
    .editor-wrap.compare-editing { background: #0b1221; }
    .editor-wrap.compare-editing .editor {
      position: relative;
      z-index: 2;
      background: transparent;
      caret-color: #e5edf9;
    }
    .editor-diff-overlay {
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow: hidden;
      pointer-events: none;
      background: #0b1221;
    }
    .editor-diff-band {
      position: absolute;
      left: 0;
      right: 0;
      border-left: 4px solid transparent;
      pointer-events: none;
    }
    .editor-diff-band.modified { background: rgba(245,158,11,.24); border-left-color: #fbbf24; }
    .editor-diff-band.added { background: rgba(34,197,94,.22); border-left-color: #4ade80; }
    .editor-diff-band.removed { background: rgba(239,68,68,.22); border-left-color: #f87171; }
    .editor-diff-band.current { outline: 2px solid rgba(96,165,250,.95); outline-offset: -2px; }
    .compare-bar.live-stale #compareSummary { opacity: .64; }
    .compare-bar.live-invalid #compareSummary { opacity: .45; }
    .compare-bar.live-stale::after {
      content: 'editing…';
      color: #fbbf24;
      font-size: 11px;
      margin-left: 8px;
    }
    .compare-bar.live-invalid::after {
      content: 'comparison paused — payload is temporarily invalid';
      color: #fca5a5;
      font-size: 11px;
      margin-left: 8px;
    }
    .pane.invalid-payload .editor-wrap { box-shadow: inset 0 0 0 1px rgba(248,113,113,.75); }
  `;
  document.head.appendChild(style);
}

function createOverlay(editor, index) {
  const wrap = editor?.closest('.editor-wrap');
  if (!wrap) return null;
  const overlay = document.createElement('div');
  overlay.className = 'editor-diff-overlay hidden';
  overlay.dataset.pane = String(index);
  wrap.insertBefore(overlay, editor);

  editor.addEventListener('scroll', () => {
    renderOverlay(index);
    scheduleNavigatorFromScroll(index);
  }, { passive: true });

  editor.addEventListener('click', (event) => selectDiffFromClick(index, event));

  const markUserScrollSource = () => {
    userScrollPane = index;
    userScrollPaneUntil = performance.now() + 900;
  };
  editor.addEventListener('wheel', markUserScrollSource, { passive: true });
  editor.addEventListener('pointerdown', markUserScrollSource, { passive: true });
  editor.addEventListener('touchstart', markUserScrollSource, { passive: true });

  window.addEventListener('resize', () => renderOverlay(index), { passive: true });
  return overlay;
}

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode || 'json';
}

function isVisible(element) {
  return !!element && !element.classList.contains('hidden') && element.offsetParent !== null;
}

function afterBusy(callback) {
  let sawBusy = document.body.classList.contains('busy');
  const started = performance.now();
  const check = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if ((sawBusy && !document.body.classList.contains('busy')) || performance.now() - started > 30000) {
      requestAnimationFrame(callback);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

compareBtn?.addEventListener('click', () => {
  afterBusy(async () => {
    if (!editors[0].value.trim() || !editors[1].value.trim()) return;
    if (!compareBar || compareBar.classList.contains('hidden')) return;
    compareActive = true;
    activeMode = currentMode();
    invalidSides = [];
    await refreshLiveComparison({ preserveNavigator: false });
  });
}, true);

editors.forEach((editor) => {
  editor.addEventListener('input', () => {
    if (!compareActive || currentMode() !== activeMode) return;

    clearTimeout(liveTimer);
    compareBar?.classList.remove('hidden', 'live-invalid');
    compareBar?.classList.add('live-stale');
    restoreLastGoodSummary();
    hideOverlays();
    disableNavigatorForEditing('Updating…');
    clearInvalidPaneMarkers();
    setLiveStatus(`Editing — comparison will refresh when ${activeMode.toUpperCase()} is valid.`);

    liveTimer = window.setTimeout(() => refreshLiveComparison({ preserveNavigator: true }), 220);
  });
});

firstDiff?.addEventListener('click', (event) => handleAbsoluteNavigation(event, 'first'), true);
prevDiff?.addEventListener('click', (event) => handleLiveNavigation(event, -1), true);
nextDiff?.addEventListener('click', (event) => handleLiveNavigation(event, 1), true);
lastDiff?.addEventListener('click', (event) => handleAbsoluteNavigation(event, 'last'), true);
clearBtn?.addEventListener('click', resetLiveCompare);
document.querySelectorAll('.mode-btn').forEach((button) => button.addEventListener('click', resetLiveCompare));
window.addEventListener('payloaddiff:comparison-reset', resetLiveCompare);

for (const pane of panes) {
  pane.addEventListener('click', () => requestAnimationFrame(() => {
    renderOverlay(0);
    renderOverlay(1);
  }));
}

function canNavigate() {
  return compareActive && !invalidSides.length && currentMode() === activeMode && orderedDiffs.length > 0;
}

function handleLiveNavigation(event, delta) {
  if (!canNavigate()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  currentDiffIndex = (currentDiffIndex + delta + orderedDiffs.length) % orderedDiffs.length;
  finishNavigation();
}

function handleAbsoluteNavigation(event, target) {
  if (!canNavigate()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  selectAbsoluteDiff(target === 'last' ? orderedDiffs.length - 1 : 0);
}

function selectAbsoluteDiff(index) {
  if (!canNavigate()) return false;
  const nextIndex = Math.min(Math.max(0, Number(index) || 0), orderedDiffs.length - 1);
  currentDiffIndex = nextIndex;
  finishNavigation();
  return true;
}

function finishNavigation() {
  updateNavigator();
  publishCoreComparisonState();
  scrollToCurrentDiff();
}

async function refreshLiveComparison({ preserveNavigator }) {
  if (!compareActive || currentMode() !== activeMode) return;
  const left = editors[0].value;
  const right = editors[1].value;
  if (!left.trim() || !right.trim()) return;

  const request = ++latestRequest;
  try {
    const result = await runLiveCompare(activeMode, left, right);
    if (request !== latestRequest || !compareActive) return;

    invalidSides = [];
    clearInvalidPaneMarkers();
    orderedDiffs = result.ordered || result.diffs || [];
    lastGoodSummary = result.summary;
    lastGoodElapsed = result.elapsedMs;
    if (!preserveNavigator || currentDiffIndex >= orderedDiffs.length) currentDiffIndex = 0;

    diffsByPane[0] = buildLineTypes(orderedDiffs, 0);
    diffsByPane[1] = buildLineTypes(orderedDiffs, 1);
    diffLinesByPane[0] = buildDiffLineIndex(orderedDiffs, 0);
    diffLinesByPane[1] = buildDiffLineIndex(orderedDiffs, 1);

    renderSummary(result);
    updateNavigator();
    renderOverlay(0);
    renderOverlay(1);
    compareBar?.classList.remove('live-stale', 'live-invalid');
    setLiveStatus(result.identical ? `Identical (${result.elapsedMs} ms)` : `Live comparison ${result.elapsedMs} ms`);
    publishCoreComparisonState(result.identical);
  } catch (error) {
    if (request !== latestRequest || !compareActive) return;
    invalidSides = Array.isArray(error.invalidSides) ? error.invalidSides : [];
    compareBar?.classList.remove('live-stale');
    compareBar?.classList.add('live-invalid');
    restoreLastGoodSummary();
    hideOverlays();
    disableNavigatorForEditing('Paused');
    markInvalidPanes(invalidSides);
    const labels = invalidSides.map((item) => item.side === 'left' ? 'File 1' : 'File 2');
    setLiveStatus(labels.length
      ? `${labels.join(' and ')} invalid — comparison will resume automatically when ${activeMode.toUpperCase()} is valid.`
      : `Editing — comparison will refresh when ${activeMode.toUpperCase()} is valid.`);
  }
}

function renderSummary(result) {
  if (!compareSummary || !compareBar) return;
  compareBar.classList.remove('hidden');
  const s = result.summary;
  if (result.identical) {
    compareSummary.innerHTML = '<strong class="same">No differences found.</strong>';
  } else {
    compareSummary.innerHTML = `<strong>${s.added + s.removed + s.modified} changes</strong> <span class="added">+${s.added} added</span> <span class="removed">−${s.removed} removed</span> <span class="modified">~${s.modified} modified</span>${s.truncated ? ' <span class="warn">(navigation capped)</span>' : ''}`;
  }
}

function restoreLastGoodSummary() {
  if (!lastGoodSummary || !compareSummary) return;
  const s = lastGoodSummary;
  const total = s.added + s.removed + s.modified;
  compareSummary.innerHTML = total
    ? `<strong>${total} changes</strong> <span class="added">+${s.added} added</span> <span class="removed">−${s.removed} removed</span> <span class="modified">~${s.modified} modified</span>`
    : '<strong class="same">No differences found.</strong>';
}

function updateNavigator() {
  const total = orderedDiffs.length;
  const blocked = total === 0 || invalidSides.length > 0;
  if (diffPosition) diffPosition.textContent = total ? `${currentDiffIndex + 1} of ${total}` : '0 of 0';
  if (firstDiff) firstDiff.disabled = blocked || currentDiffIndex <= 0;
  if (prevDiff) prevDiff.disabled = blocked;
  if (nextDiff) nextDiff.disabled = blocked;
  if (lastDiff) lastDiff.disabled = blocked || currentDiffIndex >= total - 1;
}

function disableNavigatorForEditing(label) {
  if (diffPosition) diffPosition.textContent = label;
  if (firstDiff) firstDiff.disabled = true;
  if (prevDiff) prevDiff.disabled = true;
  if (nextDiff) nextDiff.disabled = true;
  if (lastDiff) lastDiff.disabled = true;
}

function scheduleNavigatorFromScroll(index) {
  if (!compareActive || invalidSides.length || currentMode() !== activeMode || !orderedDiffs.length) return;
  if (!isVisible(editors[index])) return;
  if (performance.now() < suppressScrollTrackingUntil) return;
  if (performance.now() < userScrollPaneUntil && userScrollPane !== index) return;

  pendingScrollPane = index;
  if (scrollTrackFrame) return;
  scrollTrackFrame = requestAnimationFrame(() => {
    scrollTrackFrame = 0;
    syncNavigatorToScroll(pendingScrollPane);
  });
}

function syncNavigatorToScroll(index) {
  const editor = editors[index];
  const entries = diffLinesByPane[index];
  if (!editor || !entries.length || !isVisible(editor)) return;

  const computed = getComputedStyle(editor);
  const lineHeight = parseFloat(computed.lineHeight) || 20;
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const centerLine = visibleCenterLine({
    scrollTop: editor.scrollTop,
    clientHeight: editor.clientHeight,
    lineHeight,
    paddingTop,
  });
  selectNearestDiffForLine(index, centerLine);
}

function selectDiffFromClick(index, event) {
  if (!compareActive || invalidSides.length || currentMode() !== activeMode || !orderedDiffs.length) return;
  const editor = editors[index];
  if (!editor || !isVisible(editor)) return;

  const computed = getComputedStyle(editor);
  const lineHeight = parseFloat(computed.lineHeight) || 20;
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const rect = editor.getBoundingClientRect();
  const clickedLine = lineFromClientY({
    clientY: event.clientY,
    rectTop: rect.top,
    scrollTop: editor.scrollTop,
    lineHeight,
    paddingTop,
  });
  selectNearestDiffForLine(index, clickedLine);
}

function selectNearestDiffForLine(index, line) {
  const entries = diffLinesByPane[index];
  if (!entries.length) return;
  const nearest = nearestDiffIndexForLine(entries, line);
  if (nearest < 0 || nearest === currentDiffIndex) return;

  currentDiffIndex = nearest;
  updateNavigator();
  renderOverlay(0);
  renderOverlay(1);
  publishCoreComparisonState();
}

function publishCoreComparisonState(identical = null) {
  if (!lastGoodSummary) return;
  const total = lastGoodSummary.added + lastGoodSummary.removed + lastGoodSummary.modified;
  window.dispatchEvent(new CustomEvent('payloaddiff:live-compare-updated', {
    detail: {
      mode: activeMode,
      diffs: orderedDiffs.map(({ path, type, leftLine, rightLine }) => ({ path, type, leftLine, rightLine })),
      summary: lastGoodSummary,
      identical: identical == null ? total === 0 : identical,
      elapsedMs: lastGoodElapsed,
      currentDiffIndex,
    },
  }));
}

function scrollToCurrentDiff() {
  const diff = orderedDiffs[currentDiffIndex];
  if (!diff) return;

  suppressScrollTrackingUntil = performance.now() + 350;
  scrollEditorToLine(0, diff.leftLine || diff.rightLine);
  scrollEditorToLine(1, diff.rightLine || diff.leftLine);
  renderOverlay(0);
  renderOverlay(1);
}

function scrollEditorToLine(index, line) {
  if (!line) return;
  const editor = editors[index];
  if (!isVisible(editor)) return;
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
  editor.scrollTop = Math.max(0, (line - 1) * lineHeight - editor.clientHeight * 0.42);
}

function buildLineTypes(ordered, paneIndex) {
  const byLine = new Map();
  for (const diff of ordered) {
    const line = paneIndex === 0 ? diff.leftLine : diff.rightLine;
    if (!line) continue;
    let type = diff.type;
    if (type === 'added' && paneIndex === 0) continue;
    if (type === 'removed' && paneIndex === 1) continue;
    if (type !== 'added' && type !== 'removed') type = 'modified';
    byLine.set(line, type);
  }
  return [...byLine.entries()].map(([line, type]) => ({ line, type })).sort((a, b) => a.line - b.line);
}

function renderOverlay(index) {
  const editor = editors[index];
  const overlay = overlays[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!editor || !overlay || !wrap) return;

  const shouldShow = compareActive && !invalidSides.length && currentMode() === activeMode && isVisible(editor) && diffsByPane[index].length > 0;
  overlay.classList.toggle('hidden', !shouldShow);
  wrap.classList.toggle('compare-editing', shouldShow);
  if (!shouldShow) {
    overlay.replaceChildren();
    return;
  }

  const computed = getComputedStyle(editor);
  const lineHeight = parseFloat(computed.lineHeight) || 20;
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const firstVisible = Math.max(1, Math.floor((editor.scrollTop - paddingTop) / lineHeight) + 1);
  const lastVisible = Math.ceil((editor.scrollTop + editor.clientHeight - paddingTop) / lineHeight) + 1;
  const current = orderedDiffs[currentDiffIndex];
  const currentLine = index === 0 ? current?.leftLine : current?.rightLine;
  const entries = diffsByPane[index];
  const start = lowerBound(entries, firstVisible - 2);
  const frag = document.createDocumentFragment();

  for (let i = start; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.line > lastVisible + 2) break;
    const band = document.createElement('div');
    band.className = `editor-diff-band ${entry.type}${entry.line === currentLine ? ' current' : ''}`;
    band.style.top = `${paddingTop + (entry.line - 1) * lineHeight - editor.scrollTop}px`;
    band.style.height = `${lineHeight}px`;
    frag.appendChild(band);
  }

  overlay.replaceChildren(frag);
}

function hideOverlays() {
  for (let index = 0; index < overlays.length; index += 1) {
    overlays[index]?.replaceChildren();
    overlays[index]?.classList.add('hidden');
    editors[index]?.closest('.editor-wrap')?.classList.remove('compare-editing');
  }
}

function markInvalidPanes(items) {
  clearInvalidPaneMarkers();
  for (const item of items) {
    const index = item.side === 'left' ? 0 : item.side === 'right' ? 1 : -1;
    if (index >= 0) panes[index]?.classList.add('invalid-payload');
  }
}

function clearInvalidPaneMarkers() {
  panes.forEach((pane) => pane.classList.remove('invalid-payload'));
}

function lowerBound(entries, line) {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].line < line) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function setLiveStatus(message, error = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle('error', error);
}

function resetLiveCompare() {
  compareActive = false;
  activeMode = currentMode();
  clearTimeout(liveTimer);
  latestRequest += 1;
  orderedDiffs = [];
  lastGoodSummary = null;
  lastGoodElapsed = 0;
  currentDiffIndex = 0;
  invalidSides = [];
  diffsByPane[0] = [];
  diffsByPane[1] = [];
  diffLinesByPane[0] = [];
  diffLinesByPane[1] = [];
  suppressScrollTrackingUntil = 0;
  userScrollPane = -1;
  userScrollPaneUntil = 0;
  hideOverlays();
  clearInvalidPaneMarkers();
  compareBar?.classList.remove('live-stale', 'live-invalid');
  if (diffPosition) diffPosition.textContent = '0 of 0';
  if (firstDiff) firstDiff.disabled = true;
  if (prevDiff) prevDiff.disabled = true;
  if (nextDiff) nextDiff.disabled = true;
  if (lastDiff) lastDiff.disabled = true;
}
