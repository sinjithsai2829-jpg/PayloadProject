const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');

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

function installPane(index) {
  const editor = editors[index];
  const pane = panes[index];
  if (!editor || !pane) return;

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

  button.addEventListener('click', () => {
    setEnabled(index, !state[index].enabled, { mirror: true, notify: true, source: 'button' });
  });

  editor.addEventListener('input', () => scheduleRebuild(index, 70));
  editor.addEventListener('scroll', () => {
    if (state[index].enabled && editor.scrollLeft !== 0) editor.scrollLeft = 0;
  }, { passive: true });

  pane.querySelector('.view-tabs')?.addEventListener('click', () => requestAnimationFrame(() => updateButtonVisibility(index)));

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

function setPair(value, { notify = true } = {}) {
  const pair = Array.isArray(value) ? value : [!!value, !!value];
  for (let index = 0; index < state.length; index += 1) {
    setEnabled(index, !!pair[index], { mirror: false, notify: false, source: 'restore' });
  }
  if (notify) dispatchChanged(null, 'restore');
}

function setEnabled(index, enabled, { mirror = false, notify = true, source = 'api' } = {}) {
  const item = state[index];
  const editor = editors[index];
  if (!item || !editor) return;
  const next = !!enabled;
  if (item.enabled === next) {
    rebuild(index, true);
    updateButton(index);
    return;
  }

  item.enabled = next;
  editor.wrap = next ? 'soft' : 'off';
  editor.setAttribute('wrap', next ? 'soft' : 'off');
  editor.classList.toggle('word-wrap-enabled', next);
  if (next) editor.scrollLeft = 0;
  rebuild(index, true);
  updateButton(index);

  // Wrapped textarea rows no longer match the fixed-height folded projection.
  // Keep the user's fold state intact, but show the normal editor while wrap is
  // enabled. code-folding.js restores the folded surface when wrap is disabled.
  window.PayloadDiffCodeFolding?.refresh?.();

  if (mirror && syncInput?.checked && !mirrorLock) {
    mirrorLock = true;
    const other = index === 0 ? 1 : 0;
    setEnabled(other, next, { mirror: false, notify: false, source: 'sync' });
    mirrorLock = false;
  }

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
  try {
    window.PayloadDiffDiagnostics?.log?.('info', 'word-wrap.changed', detail);
  } catch (_) {}
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
    const rows = item.enabled
      ? Math.max(1, Math.ceil(Math.max(1, columns) / columnsPerRow))
      : 1;
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
  `;
  document.head.appendChild(style);
}
