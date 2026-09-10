const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const compareBtn = document.querySelector('#compareBtn');
const clearBtn = document.querySelector('#clearBtn');
const compareBar = document.querySelector('#compareBar');
const compareSummary = document.querySelector('#compareSummary');
const diffPosition = document.querySelector('#diffPosition');
const prevDiff = document.querySelector('#prevDiff');
const nextDiff = document.querySelector('#nextDiff');
const statusText = document.querySelector('#statusText');

let compareActive = false;
let liveTimer = 0;
let workerSeq = 0;
let latestRequest = 0;
let currentDiffIndex = 0;
let orderedDiffs = [];
let lastGoodSummary = null;
let lastGoodElapsed = 0;
const workerPending = new Map();
const diffsByPane = [[], []];

const worker = new Worker(new URL('./smooth-worker.js', import.meta.url), { type: 'module' });
worker.onmessage = ({ data }) => {
  const pending = workerPending.get(data.id);
  if (!pending) return;
  workerPending.delete(data.id);
  data.ok ? pending.resolve(data.result) : pending.reject(new Error(data.error));
};

function runFastCompare(left, right) {
  return new Promise((resolve, reject) => {
    const id = ++workerSeq;
    workerPending.set(id, { resolve, reject });
    worker.postMessage({ id, task: 'compareJson', payload: { left, right } });
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
      border-left: 3px solid transparent;
      pointer-events: none;
    }
    .editor-diff-band.modified { background: rgba(245,158,11,.14); border-left-color: #f59e0b; }
    .editor-diff-band.added { background: rgba(34,197,94,.13); border-left-color: #22c55e; }
    .editor-diff-band.removed { background: rgba(239,68,68,.13); border-left-color: #ef4444; }
    .editor-diff-band.current { outline: 1px solid rgba(96,165,250,.9); outline-offset: -1px; }
    .compare-bar.live-stale #compareSummary { opacity: .72; }
    .compare-bar.live-stale::after {
      content: 'editing…';
      color: #fbbf24;
      font-size: 11px;
      margin-left: 8px;
    }
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
  editor.addEventListener('scroll', () => renderOverlay(index), { passive: true });
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
  const check = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if (sawBusy && !document.body.classList.contains('busy')) {
      requestAnimationFrame(callback);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

compareBtn?.addEventListener('click', () => {
  afterBusy(async () => {
    if (currentMode() !== 'json' || !editors[0].value.trim() || !editors[1].value.trim()) return;
    const succeeded = !!compareBar && !compareBar.classList.contains('hidden');
    if (!succeeded) return;
    compareActive = true;
    await refreshFastComparison({ preserveNavigator: false });
  });
}, true);

editors.forEach((editor) => {
  editor.addEventListener('input', () => {
    if (!compareActive || currentMode() !== 'json') return;

    clearTimeout(liveTimer);

    // main.js clears its private comparison state on input. Re-show the last
    // successful comparison immediately so editing never feels like leaving
    // compare mode. Do not clear the last-good highlights.
    requestAnimationFrame(() => {
      if (!compareActive || !compareBar) return;
      compareBar.classList.remove('hidden');
      compareBar.classList.add('live-stale');
      restoreLastGoodSummary();
      renderOverlay(0);
      renderOverlay(1);
    });

    // Small debounce keeps typing smooth. No formatting and no synthetic
    // Compare click: one parse + one structural diff in one worker only.
    liveTimer = window.setTimeout(() => refreshFastComparison({ preserveNavigator: true }), 220);
  });
});

prevDiff?.addEventListener('click', (event) => handleFastNavigation(event, -1), true);
nextDiff?.addEventListener('click', (event) => handleFastNavigation(event, 1), true);

function handleFastNavigation(event, delta) {
  if (!compareActive || currentMode() !== 'json' || !orderedDiffs.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  currentDiffIndex = (currentDiffIndex + delta + orderedDiffs.length) % orderedDiffs.length;
  updateNavigator();
  scrollToCurrentDiff();
}

clearBtn?.addEventListener('click', resetLiveCompare);
document.querySelectorAll('.mode-btn').forEach((button) => button.addEventListener('click', resetLiveCompare));

for (const pane of panes) {
  pane.addEventListener('click', () => requestAnimationFrame(() => {
    renderOverlay(0);
    renderOverlay(1);
  }));
}

async function refreshFastComparison({ preserveNavigator }) {
  if (!compareActive || currentMode() !== 'json') return;
  const left = editors[0].value;
  const right = editors[1].value;
  if (!left.trim() || !right.trim()) return;

  const request = ++latestRequest;
  try {
    const result = await runFastCompare(left, right);
    if (request !== latestRequest || !compareActive) return;

    orderedDiffs = result.ordered || [];
    lastGoodSummary = result.summary;
    lastGoodElapsed = result.elapsedMs;
    if (!preserveNavigator || currentDiffIndex >= orderedDiffs.length) currentDiffIndex = 0;

    diffsByPane[0] = buildLineTypes(orderedDiffs, 0);
    diffsByPane[1] = buildLineTypes(orderedDiffs, 1);

    renderSummary(result);
    updateNavigator();
    renderOverlay(0);
    renderOverlay(1);
    compareBar?.classList.remove('live-stale');
    setLiveStatus(result.identical ? `Identical (${result.elapsedMs} ms)` : `Live comparison ${result.elapsedMs} ms`);
  } catch (error) {
    if (request !== latestRequest || !compareActive) return;
    // A half-typed JSON document is normal. Keep last good comparison visible
    // and retry on the next edit instead of clearing the UI or showing a loud
    // parse error while the user is typing.
    compareBar?.classList.add('live-stale');
    restoreLastGoodSummary();
    setLiveStatus('Editing — comparison will refresh when JSON is valid.', false);
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
  updateNavigator();
}

function updateNavigator() {
  const total = orderedDiffs.length;
  if (diffPosition) diffPosition.textContent = total ? `${currentDiffIndex + 1} of ${total}` : '0 of 0';
  if (prevDiff) prevDiff.disabled = total === 0;
  if (nextDiff) nextDiff.disabled = total === 0;
}

function scrollToCurrentDiff() {
  const diff = orderedDiffs[currentDiffIndex];
  if (!diff) return;
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

  const shouldShow = compareActive && currentMode() === 'json' && isVisible(editor) && diffsByPane[index].length > 0;
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
  clearTimeout(liveTimer);
  latestRequest += 1;
  orderedDiffs = [];
  lastGoodSummary = null;
  currentDiffIndex = 0;
  diffsByPane[0] = [];
  diffsByPane[1] = [];
  for (let index = 0; index < 2; index += 1) {
    overlays[index]?.replaceChildren();
    overlays[index]?.classList.add('hidden');
    editors[index]?.closest('.editor-wrap')?.classList.remove('compare-editing');
  }
  compareBar?.classList.remove('live-stale');
}
