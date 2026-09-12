const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');
const STORAGE_KEY = 'payloaddiff:word-wrap:v1';

const state = editors.map(() => ({
  enabled: false,
  lines: [''],
  visualRowStarts: [0],
  visualRows: [1],
  columnsPerRow: Infinity,
  charWidth: 8,
  lineHeight: 20,
  paddingTop: 0,
  paddingLeft: 0,
  paddingRight: 0,
  tabSize: 2,
  signature: '',
  rebuildTimer: 0,
}));
const buttons = [];
const wrapDiffLayers = [];
const wrapSyntaxLayers = [];
const renderFrames = [0, 0];
let mirrorLock = false;

installStyles();
for (let index = 0; index < editors.length; index += 1) installPane(index);

window.PayloadDiffWordWrap = {
  get: () => state.map((item) => !!item.enabled),
  set: (value, options = {}) => setPair(value, options),
  isEnabled: (index) => !!state[index]?.enabled,
  refresh: (index = null) => {
    if (index == null) editors.forEach((_, paneIndex) => rebuild(paneIndex, true));
    else rebuild(index, true);
  },
  getLineMetrics: (index, line) => getLineMetrics(index, line),
  getVisibleLineRange: (index, overscan = 2) => getVisibleLineRange(index, overscan),
  lineAtContentY: (index, contentY) => lineAtContentY(index, contentY),
  scrollTopForLine: (index, line, viewportRatio = 0.42) => scrollTopForLine(index, line, viewportRatio),
  getSegmentRects: (index, line, start, end) => getSegmentRects(index, line, start, end),
};

restorePreference();
installGlobalHooks();

function installPane(index) {
  const editor = editors[index];
  const pane = panes[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!editor || !pane || !wrap) return;

  const tools = pane.querySelector('.pane-tools');
  const tabs = pane.querySelector('.view-tabs');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-wrap-toggle';
  button.textContent = 'Wrap';
  button.title = 'Toggle word wrap for long Code lines';
  button.setAttribute('aria-label', `Toggle word wrap in File ${index + 1} Code view`);
  button.setAttribute('aria-pressed', 'false');
  buttons[index] = button;

  if (tools && tabs) tabs.insertAdjacentElement('afterend', button);
  else tabs?.parentNode?.insertBefore(button, tabs.nextSibling);

  const diffLayer = document.createElement('div');
  diffLayer.className = 'wrap-diff-layer hidden';
  diffLayer.setAttribute('aria-hidden', 'true');
  wrap.appendChild(diffLayer);
  wrapDiffLayers[index] = diffLayer;

  const syntaxLayer = document.createElement('div');
  syntaxLayer.className = 'wrap-syntax-layer hidden';
  syntaxLayer.setAttribute('aria-hidden', 'true');
  wrap.appendChild(syntaxLayer);
  wrapSyntaxLayers[index] = syntaxLayer;

  button.addEventListener('click', () => {
    setEnabled(index, !state[index].enabled, { mirror: true, notify: true, source: 'button' });
  });

  editor.addEventListener('input', () => scheduleRebuild(index, 70));
  editor.addEventListener('scroll', () => {
    if (state[index].enabled && editor.scrollLeft !== 0) editor.scrollLeft = 0;
    scheduleRender(index);
  }, { passive: true });

  pane.querySelector('.view-tabs')?.addEventListener('click', () => requestAnimationFrame(() => {
    updateButtonVisibility(index);
    scheduleRender(index);
  }));

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => scheduleRebuild(index, 90));
    observer.observe(editor);
  } else {
    window.addEventListener('resize', () => scheduleRebuild(index, 90), { passive: true });
  }

  rebuild(index, true);
  updateButton(index);
  updateButtonVisibility(index);
}

function installGlobalHooks() {
  window.addEventListener('payloaddiff:live-compare-updated', () => scheduleAllRender());
  window.addEventListener('payloaddiff:comparison-reset', () => scheduleAllRender());
  window.addEventListener('payloaddiff:syntax-issues-updated', (event) => {
    const index = Number(event.detail?.paneIndex);
    if (Number.isInteger(index)) scheduleRender(index);
  });
  window.addEventListener('payloaddiff:word-wrap-layout', (event) => {
    const index = Number(event.detail?.paneIndex);
    if (Number.isInteger(index)) scheduleRender(index);
  });

  // The live compare module still uses fixed-height line math internally. After
  // a navigator click, correct the final scroll position using wrapped-row
  // metrics so the selected difference lands in the visible center.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#firstDiff, #prevDiff, #nextDiff, #lastDiff');
    if (!button) return;
    requestAnimationFrame(() => requestAnimationFrame(correctNavigatorScroll));
  }, true);
}

function setPair(value, { notify = true } = {}) {
  const pair = Array.isArray(value) ? value : [!!value, !!value];
  for (let index = 0; index < state.length; index += 1) {
    setEnabled(index, !!pair[index], { mirror: false, notify: false, source: 'restore' });
  }
  persistPreference();
  if (notify) dispatchChanged(null, 'restore');
}

function setEnabled(index, enabled, { mirror = false, notify = true, source = 'api' } = {}) {
  const item = state[index];
  const editor = editors[index];
  const pane = panes[index];
  if (!item || !editor || !pane) return;
  const next = !!enabled;

  item.enabled = next;
  editor.wrap = next ? 'soft' : 'off';
  editor.setAttribute('wrap', next ? 'soft' : 'off');
  editor.classList.toggle('word-wrap-enabled', next);
  pane.classList.toggle('word-wrap-active', next);
  if (next) editor.scrollLeft = 0;
  rebuild(index, true);
  updateButton(index);
  scheduleRender(index);

  if (mirror && syncInput?.checked && !mirrorLock) {
    mirrorLock = true;
    const other = index === 0 ? 1 : 0;
    setEnabled(other, next, { mirror: false, notify: false, source: 'sync' });
    mirrorLock = false;
  }

  persistPreference();
  if (notify) dispatchChanged(index, source);
}

function dispatchChanged(index, source) {
  const detail = {
    paneIndex: Number.isInteger(index) ? index : null,
    enabled: Number.isInteger(index) ? state[index].enabled : null,
    states: state.map((item) => !!item.enabled),
    source,
  };
  window.dispatchEvent(new CustomEvent('payloaddiff:word-wrap-changed', { detail }));
  try { window.PayloadDiffDiagnostics?.log?.('info', 'word-wrap.changed', detail); } catch (_) {}
}

function restorePreference() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(stored)) setPair(stored, { notify: false });
  } catch (_) {}
}

function persistPreference() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.map((item) => !!item.enabled))); } catch (_) {}
}

function updateButton(index) {
  const button = buttons[index];
  const enabled = !!state[index]?.enabled;
  if (!button) return;
  button.classList.toggle('active', enabled);
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  button.title = enabled ? 'Turn word wrap off' : 'Wrap long Code lines inside the panel';
}

function updateButtonVisibility(index) {
  const treeActive = panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
  buttons[index]?.classList.toggle('hidden', !!treeActive);
}

function scheduleRebuild(index, delay) {
  const item = state[index];
  if (!item) return;
  clearTimeout(item.rebuildTimer);
  item.rebuildTimer = window.setTimeout(() => rebuild(index, true), delay);
}

function rebuild(index, force = false) {
  const editor = editors[index];
  const item = state[index];
  if (!editor || !item) return;

  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const tabSize = Math.max(1, parseInt(style.tabSize, 10) || 2);
  const charWidth = measureCharWidth(style);
  const contentWidth = Math.max(charWidth, editor.clientWidth - paddingLeft - paddingRight - 2);
  const columnsPerRow = item.enabled ? Math.max(8, Math.floor(contentWidth / Math.max(1, charWidth))) : Infinity;
  const signature = `${editor.value.length}:${editor.clientWidth}:${item.enabled}:${lineHeight}:${paddingLeft}:${paddingRight}:${charWidth.toFixed(3)}`;
  if (!force && signature === item.signature) return;

  const lines = String(editor.value || '').split('\n');
  const visualRows = new Array(lines.length);
  const visualRowStarts = new Array(lines.length);
  let rowCursor = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    visualRowStarts[lineIndex] = rowCursor;
    const columns = item.enabled ? visualColumns(lines[lineIndex], tabSize) : 1;
    const rows = item.enabled ? Math.max(1, Math.ceil(Math.max(1, columns) / columnsPerRow)) : 1;
    visualRows[lineIndex] = rows;
    rowCursor += rows;
  }

  Object.assign(item, {
    lines,
    visualRows,
    visualRowStarts,
    columnsPerRow,
    charWidth,
    lineHeight,
    paddingTop,
    paddingLeft,
    paddingRight,
    tabSize,
    signature,
  });

  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('payloaddiff:word-wrap-layout', {
      detail: { paneIndex: index, enabled: item.enabled },
    }));
  });
}

function ensureFresh(index) {
  const editor = editors[index];
  const item = state[index];
  if (!editor || !item) return item;
  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const charWidth = measureCharWidth(style);
  const signature = `${editor.value.length}:${editor.clientWidth}:${item.enabled}:${lineHeight}:${paddingLeft}:${paddingRight}:${charWidth.toFixed(3)}`;
  if (signature !== item.signature) rebuild(index, true);
  return item;
}

function getLineMetrics(index, line) {
  const item = ensureFresh(index);
  const safeLine = Math.max(1, Math.min(Number(line) || 1, item?.lines?.length || 1));
  const lineIndex = safeLine - 1;
  return {
    line: safeLine,
    top: (item?.paddingTop || 0) + (item?.visualRowStarts?.[lineIndex] || 0) * (item?.lineHeight || 20),
    height: (item?.visualRows?.[lineIndex] || 1) * (item?.lineHeight || 20),
    rows: item?.visualRows?.[lineIndex] || 1,
    lineHeight: item?.lineHeight || 20,
    columnsPerRow: item?.columnsPerRow || Infinity,
  };
}

function getVisibleLineRange(index, overscan = 2) {
  const editor = editors[index];
  const item = ensureFresh(index);
  if (!editor || !item?.lines?.length) return { first: 1, last: 1 };
  const first = Math.max(1, lineAtContentY(index, editor.scrollTop) - overscan);
  const last = Math.min(item.lines.length, lineAtContentY(index, editor.scrollTop + editor.clientHeight) + overscan);
  return { first, last };
}

function lineAtContentY(index, contentY) {
  const item = ensureFresh(index);
  if (!item?.lines?.length) return 1;
  const row = Math.max(0, Math.floor((Math.max(0, Number(contentY) || 0) - item.paddingTop) / item.lineHeight));
  const starts = item.visualRowStarts;
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= row) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(1, Math.min(starts.length, high + 1));
}

function scrollTopForLine(index, line, viewportRatio = 0.42) {
  const editor = editors[index];
  if (!editor) return 0;
  const metrics = getLineMetrics(index, line);
  return Math.max(0, metrics.top - editor.clientHeight * viewportRatio);
}

function getSegmentRects(index, line, start, end) {
  const item = ensureFresh(index);
  const editor = editors[index];
  if (!item || !editor) return [];
  const text = item.lines[Math.max(0, Math.min(item.lines.length - 1, (Number(line) || 1) - 1))] || '';
  const safeStart = Math.max(0, Math.min(Number(start) || 0, text.length));
  const safeEnd = Math.max(safeStart, Math.min(Number(end) || 0, text.length));
  const lineMetrics = getLineMetrics(index, line);

  if (!item.enabled || !Number.isFinite(item.columnsPerRow)) {
    return [{
      top: lineMetrics.top,
      left: item.paddingLeft + visualColumns(text.slice(0, safeStart), item.tabSize) * item.charWidth,
      width: Math.max(item.charWidth * .8, visualColumns(text.slice(safeStart, safeEnd), item.tabSize) * item.charWidth),
      height: item.lineHeight,
    }];
  }

  const startColumn = visualColumns(text.slice(0, safeStart), item.tabSize);
  const endColumn = Math.max(startColumn + 1, visualColumns(text.slice(0, safeEnd), item.tabSize));
  const firstRow = Math.floor(startColumn / item.columnsPerRow);
  const lastRow = Math.floor(Math.max(startColumn, endColumn - 1) / item.columnsPerRow);
  const rects = [];

  for (let row = firstRow; row <= lastRow; row += 1) {
    const rowStartColumn = row * item.columnsPerRow;
    const rowEndColumn = rowStartColumn + item.columnsPerRow;
    const from = Math.max(startColumn, rowStartColumn);
    const to = Math.min(endColumn, rowEndColumn);
    if (to <= from) continue;
    rects.push({
      top: lineMetrics.top + row * item.lineHeight,
      left: item.paddingLeft + (from - rowStartColumn) * item.charWidth,
      width: Math.max(item.charWidth * .8, (to - from) * item.charWidth),
      height: item.lineHeight,
    });
  }

  return rects;
}

function scheduleAllRender() {
  scheduleRender(0);
  scheduleRender(1);
}

function scheduleRender(index) {
  if (renderFrames[index]) return;
  renderFrames[index] = requestAnimationFrame(() => {
    renderFrames[index] = 0;
    renderWrapDiffs(index);
    renderWrapSyntax(index);
  });
}

function renderWrapDiffs(index) {
  const pane = panes[index];
  const editor = editors[index];
  const layer = wrapDiffLayers[index];
  if (!pane || !editor || !layer) return;
  const treeActive = pane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
  const result = window.PayloadDiffCompareSession?.getResult?.();
  const enabled = state[index].enabled && !treeActive && !!result && window.PayloadDiffCompareSession?.isActive?.();
  layer.classList.toggle('hidden', !enabled);
  layer.replaceChildren();
  if (!enabled) return;

  const range = getVisibleLineRange(index, 4);
  const current = window.PayloadDiffCompareSession?.getCurrentDiffIndex?.() ?? -1;
  const fragment = document.createDocumentFragment();
  const diffs = Array.isArray(result.diffs) ? result.diffs : [];

  for (let diffIndex = 0; diffIndex < diffs.length; diffIndex += 1) {
    const diff = diffs[diffIndex];
    const line = index === 0 ? diff.leftLine : diff.rightLine;
    if (!line || line < range.first || line > range.last) continue;
    if (diff.type === 'added' && index === 0) continue;
    if (diff.type === 'removed' && index === 1) continue;
    const type = diff.type === 'added' || diff.type === 'removed' ? diff.type : 'modified';
    const metrics = getLineMetrics(index, line);
    const band = document.createElement('div');
    band.className = `wrap-diff-band ${type}${diffIndex === current ? ' current' : ''}`;
    band.style.top = `${metrics.top - editor.scrollTop}px`;
    band.style.height = `${metrics.height}px`;
    fragment.appendChild(band);
  }
  layer.appendChild(fragment);
}

function renderWrapSyntax(index) {
  const pane = panes[index];
  const editor = editors[index];
  const layer = wrapSyntaxLayers[index];
  if (!pane || !editor || !layer) return;
  const treeActive = pane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
  const issues = window.PayloadDiffSyntaxIssues?.getIssues?.(index) || [];
  const enabled = state[index].enabled && !treeActive && issues.length > 0;
  layer.classList.toggle('hidden', !enabled);
  layer.replaceChildren();
  if (!enabled) return;

  const range = getVisibleLineRange(index, 4);
  const fragment = document.createDocumentFragment();
  const seen = new Set();
  for (const issue of issues) {
    if (!issue?.line || issue.line < range.first || issue.line > range.last || seen.has(issue.line)) continue;
    seen.add(issue.line);
    const metrics = getLineMetrics(index, issue.line);
    const band = document.createElement('div');
    band.className = 'wrap-syntax-band';
    band.style.top = `${metrics.top - editor.scrollTop}px`;
    band.style.height = `${metrics.height}px`;
    fragment.appendChild(band);
  }
  layer.appendChild(fragment);
}

function correctNavigatorScroll() {
  const result = window.PayloadDiffCompareSession?.getResult?.();
  const index = window.PayloadDiffCompareSession?.getCurrentDiffIndex?.();
  if (!result || !Number.isInteger(index)) return;
  const diff = result.diffs?.[index];
  if (!diff) return;
  for (let paneIndex = 0; paneIndex < editors.length; paneIndex += 1) {
    if (!state[paneIndex].enabled) continue;
    const line = paneIndex === 0 ? (diff.leftLine || diff.rightLine) : (diff.rightLine || diff.leftLine);
    if (!line) continue;
    editors[paneIndex].scrollTop = scrollTopForLine(paneIndex, line, 0.42);
    scheduleRender(paneIndex);
  }
}

function visualColumns(text, tabSize) {
  let columns = 0;
  for (const char of String(text || '')) {
    if (char === '\t') columns += tabSize - (columns % tabSize || 0);
    else columns += 1;
  }
  return columns;
}

function measureCharWidth(style) {
  const canvas = measureCharWidth.canvas || (measureCharWidth.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  if (!context) return (parseFloat(style.fontSize) || 13) * .62;
  context.font = `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${style.fontSize || '13px'} ${style.fontFamily || 'monospace'}`;
  return context.measureText('M').width || (parseFloat(style.fontSize) || 13) * .62;
}

function installStyles() {
  if (document.querySelector('#word-wrap-styles')) return;
  const style = document.createElement('style');
  style.id = 'word-wrap-styles';
  style.textContent = `
    .word-wrap-toggle {
      flex: 0 0 auto;
      padding: 5px 9px;
      font-size: 11px;
      white-space: nowrap;
    }
    .word-wrap-toggle.active,
    .word-wrap-toggle[aria-pressed="true"] {
      border-color: #4479ef;
      background: #25375f;
      color: #eaf2ff;
    }
    .editor.word-wrap-enabled {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-all;
      overflow-x: hidden;
    }
    .word-wrap-active .editor-diff-overlay,
    .word-wrap-active .inline-diff-layer,
    .word-wrap-active .syntax-line-layer,
    .word-wrap-active .code-fold-gutter,
    .word-wrap-active .fold-code-view {
      display: none !important;
    }
    .wrap-diff-layer,
    .wrap-syntax-layer {
      position: absolute;
      inset: 0 14px 0 64px;
      overflow: hidden;
      pointer-events: none;
    }
    .wrap-diff-layer { z-index: 3; }
    .wrap-syntax-layer { z-index: 7; }
    .wrap-diff-band,
    .wrap-syntax-band {
      position: absolute;
      left: 0;
      right: 0;
      pointer-events: none;
    }
    .wrap-diff-band.modified { background: rgba(245,158,11,.18); border-left: 4px solid #f59e0b; }
    .wrap-diff-band.added { background: rgba(34,197,94,.16); border-left: 4px solid #22c55e; }
    .wrap-diff-band.removed { background: rgba(239,68,68,.16); border-left: 4px solid #ef4444; }
    .wrap-diff-band.current { outline: 2px solid rgba(96,165,250,.95); outline-offset: -2px; }
    .wrap-syntax-band { background: rgba(239,68,68,.08); border-left: 3px solid #ef4444; }
    [data-theme="light"] .word-wrap-toggle.active,
    [data-theme="light"] .word-wrap-toggle[aria-pressed="true"] {
      background: #dbeafe;
      color: #1e3a8a;
      border-color: #60a5fa;
    }
  `;
  document.head.appendChild(style);
}
