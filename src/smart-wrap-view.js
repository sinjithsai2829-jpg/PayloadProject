import { SMART_WRAP_MAX_COLUMNS, smartWrapLayout } from './smart-wrap-model.js';

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');
const surfaces = [];
const contents = [];
const state = editors.map(() => ({
  active: false,
  editing: false,
  lines: [''],
  lineStarts: [0],
  layouts: [],
  rowTops: [],
  rowHeights: [],
  totalHeight: 0,
  lineHeight: 20,
  charWidth: 8,
  columns: SMART_WRAP_MAX_COLUMNS,
  tabSize: 2,
  frame: 0,
  rebuildTimer: 0,
  syncLock: false,
  signature: '',
}));
let globalSyncLock = false;

installStyles();
for (let index = 0; index < editors.length; index += 1) installPane(index);
installHooks();
installAlignedWrapObserver();

window.PayloadDiffSmartWrap = {
  isActive: (index) => !!state[index]?.active,
  rebuild: (index = null) => {
    if (index == null) editors.forEach((_, paneIndex) => rebuild(paneIndex, true));
    else rebuild(index, true);
  },
  revealLine: (index, line, viewportRatio = 0.42) => revealLine(index, line, viewportRatio),
  revealOffset: (index, offset, viewportRatio = 0.42) => revealOffset(index, offset, viewportRatio),
  getLineMetrics: (index, line) => smartLineMetrics(index, line),
  getVisibleLineRange: (index, overscan = 2) => visibleLineRange(index, overscan),
  getState: (index) => publicState(index),
};

function installPane(index) {
  const editor = editors[index];
  const pane = panes[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!editor || !pane || !wrap) return;

  const surface = document.createElement('div');
  surface.className = 'smart-wrap-view hidden';
  surface.dataset.pane = String(index);
  surface.tabIndex = 0;
  surface.setAttribute('aria-label', `File ${index + 1} smart wrapped Code view`);

  const content = document.createElement('div');
  content.className = 'smart-wrap-content';
  surface.appendChild(content);
  wrap.appendChild(surface);
  surfaces[index] = surface;
  contents[index] = content;

  surface.addEventListener('scroll', () => {
    scheduleRender(index);
    syncScroll(index);
  }, { passive: true });

  surface.addEventListener('dblclick', (event) => {
    const row = event.target.closest('.smart-wrap-row[data-line]');
    if (!row) return;
    event.preventDefault();
    beginSourceEdit(index, Number(row.dataset.line));
  });

  editor.addEventListener('input', () => scheduleRebuild(index, 70));
  editor.addEventListener('scroll', () => {
    if (!state[index].active || state[index].editing) return;
    // Programmatic Code-search/navigation still targets the underlying editor.
    // Follow its logical position so Smart Wrap remains in sync.
    const line = lineAtEditorScroll(index);
    revealLine(index, line, 0.42, { silent: true });
  }, { passive: true });

  editor.addEventListener('blur', () => {
    if (!state[index].editing) return;
    setTimeout(() => finishSourceEdit(index), 0);
  });

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => scheduleRebuild(index, 100));
    observer.observe(surface);
    observer.observe(wrap);
  }

  rebuild(index, true);
  updateVisibility(index);
}

function installHooks() {
  window.addEventListener('payloaddiff:word-wrap-changed', (event) => {
    const index = Number(event.detail?.paneIndex);
    if (Number.isInteger(index)) {
      rebuild(index, true);
      updateVisibility(index);
    } else {
      editors.forEach((_, paneIndex) => {
        rebuild(paneIndex, true);
        updateVisibility(paneIndex);
      });
    }
    refreshAlignedSmartWrap();
  });

  window.addEventListener('payloaddiff:word-wrap-layout', (event) => {
    const index = Number(event.detail?.paneIndex);
    if (Number.isInteger(index)) {
      scheduleRebuild(index, 0);
      updateVisibility(index);
    }
  });

  window.addEventListener('payloaddiff:view-surface-synced', () => editors.forEach((_, index) => updateVisibility(index)));
  window.addEventListener('payloaddiff:comparison-reset', () => editors.forEach((_, index) => {
    updateVisibility(index);
    scheduleRender(index);
  }));
  window.addEventListener('payloaddiff:live-compare-updated', (event) => {
    editors.forEach((_, index) => {
      updateVisibility(index);
      scheduleRender(index);
    });
    revealCurrentDifference(event.detail);
    refreshAlignedSmartWrap();
  });
  window.addEventListener('payloaddiff:syntax-issues-updated', (event) => {
    const index = Number(event.detail?.paneIndex);
    if (Number.isInteger(index)) scheduleRender(index);
  });
  window.addEventListener('payloaddiff:theme-changed', () => editors.forEach((_, index) => scheduleRender(index)));

  document.querySelectorAll('.view-tabs').forEach((tabs) => {
    tabs.addEventListener('click', () => {
      const index = Number(tabs.dataset.pane);
      requestAnimationFrame(() => updateVisibility(index));
    }, true);
  });

  document.addEventListener('selectionchange', () => {
    const active = document.activeElement;
    const index = editors.indexOf(active);
    if (index < 0 || state[index].editing || !isWrapEnabled(index)) return;
    revealOffset(index, active.selectionStart || 0, 0.42);
    scheduleRender(index);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('#firstDiff, #prevDiff, #nextDiff, #lastDiff, .search-run, .search-prev, .search-next')) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      editors.forEach((editor, index) => {
        if (!state[index].active || state[index].editing) return;
        revealOffset(index, editor.selectionStart || 0, 0.42);
      });
    }));
  }, true);
}

function scheduleRebuild(index, delay = 80) {
  const item = state[index];
  if (!item) return;
  clearTimeout(item.rebuildTimer);
  item.rebuildTimer = setTimeout(() => rebuild(index, true), delay);
}

function rebuild(index, force = false) {
  const editor = editors[index];
  const surface = surfaces[index];
  const item = state[index];
  if (!editor || !surface || !item) return;

  const editorStyle = getComputedStyle(editor);
  const surfaceStyle = getComputedStyle(surface);
  const lineHeight = parseFloat(editorStyle.lineHeight) || 20;
  const charWidth = measureCharWidth(editorStyle);
  const tabSize = Math.max(1, parseInt(editorStyle.tabSize, 10) || 2);
  const gutter = 78;
  const horizontalPadding = 28;
  const usableWidth = Math.max(charWidth * 24, (surface.clientWidth || editor.clientWidth || 700) - gutter - horizontalPadding - 18);
  const columns = Math.max(24, Math.min(SMART_WRAP_MAX_COLUMNS, Math.floor(usableWidth / Math.max(1, charWidth))));
  const signature = `${editor.value.length}:${surface.clientWidth}:${columns}:${lineHeight}:${charWidth.toFixed(3)}:${isWrapEnabled(index)}`;
  if (!force && signature === item.signature) return;

  const lines = String(editor.value || '').split('\n');
  const lineStarts = new Array(lines.length);
  const layouts = new Array(lines.length);
  const rowTops = new Array(lines.length);
  const rowHeights = new Array(lines.length);
  let offset = 0;
  let top = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    lineStarts[lineIndex] = offset;
    rowTops[lineIndex] = top;
    const layout = smartWrapLayout(lines[lineIndex], columns, tabSize);
    layouts[lineIndex] = layout;
    const height = Math.max(lineHeight, layout.rows * lineHeight);
    rowHeights[lineIndex] = height;
    top += height;
    offset += lines[lineIndex].length + 1;
  }

  Object.assign(item, {
    lines,
    lineStarts,
    layouts,
    rowTops,
    rowHeights,
    totalHeight: top,
    lineHeight,
    charWidth,
    columns,
    tabSize,
    signature,
  });

  surface.style.setProperty('--pd-smart-line-height', `${lineHeight}px`);
  surface.style.setProperty('--pd-smart-char-width', `${charWidth}px`);
  surfaceStyle;
  updateVisibility(index);
  scheduleRender(index);
  window.dispatchEvent(new CustomEvent('payloaddiff:smart-wrap-layout', {
    detail: { paneIndex: index, enabled: isWrapEnabled(index), columns, lines: lines.length },
  }));
}

function updateVisibility(index) {
  const pane = panes[index];
  const editor = editors[index];
  const surface = surfaces[index];
  const wrap = editor?.closest('.editor-wrap');
  const item = state[index];
  if (!pane || !editor || !surface || !wrap || !item) return;

  const treeActive = pane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
  const alignedActive = !!window.PayloadDiffAlignedCompare?.isActive?.();
  const active = isWrapEnabled(index) && !treeActive && !alignedActive && !item.editing;
  item.active = active;
  surface.classList.toggle('hidden', !active);
  wrap.classList.toggle('smart-wrap-active', active);
  if (active) scheduleRender(index);
  try { window.PayloadDiffScrollbars?.refresh?.(index); } catch (_) {}
}

function render(index) {
  const surface = surfaces[index];
  const content = contents[index];
  const item = state[index];
  if (!surface || !content || !item?.active || !item.lines.length) return;

  const first = Math.max(0, lineIndexAtY(item, surface.scrollTop) - 8);
  const last = Math.min(item.lines.length - 1, lineIndexAtY(item, surface.scrollTop + surface.clientHeight) + 8);
  const compare = window.PayloadDiffCompareSession?.getResult?.();
  const currentDiff = window.PayloadDiffCompareSession?.getCurrentDiffIndex?.() ?? -1;
  const diffMap = buildDiffMap(compare?.diffs, index, currentDiff);
  const syntaxLines = new Set((window.PayloadDiffSyntaxIssues?.getIssues?.(index) || []).map((issue) => Number(issue.line)).filter(Boolean));
  const selection = editorSelection(index);

  const fragment = document.createDocumentFragment();
  const spacer = document.createElement('div');
  spacer.className = 'smart-wrap-spacer';
  spacer.style.height = `${Math.max(item.totalHeight, surface.clientHeight)}px`;
  fragment.appendChild(spacer);

  for (let lineIndex = first; lineIndex <= last; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const row = document.createElement('div');
    const diff = diffMap.get(lineNumber);
    row.className = `smart-wrap-row${diff ? ` diff-${diff.type}` : ''}${diff?.current ? ' current' : ''}${syntaxLines.has(lineNumber) ? ' syntax-error' : ''}`;
    row.dataset.line = String(lineNumber);
    row.style.top = `${item.rowTops[lineIndex]}px`;
    row.style.height = `${item.rowHeights[lineIndex]}px`;

    const gutter = document.createElement('span');
    gutter.className = 'smart-wrap-gutter';
    gutter.textContent = lineNumber.toLocaleString();
    row.appendChild(gutter);

    const text = document.createElement('span');
    text.className = 'smart-wrap-text';
    const layout = item.layouts[lineIndex];
    const absoluteLineStart = item.lineStarts[lineIndex];
    for (let segmentIndex = 0; segmentIndex < layout.segments.length; segmentIndex += 1) {
      const segment = layout.segments[segmentIndex];
      const visual = document.createElement('span');
      visual.className = `smart-wrap-segment${segment.continuation ? ' continuation' : ''}`;
      if (segment.continuation) visual.style.paddingLeft = `${layout.continuationColumn * item.charWidth}px`;
      appendSelectedText(visual, segment.text, absoluteLineStart + segment.start, selection);
      text.appendChild(visual);
    }
    row.appendChild(text);
    fragment.appendChild(row);
  }

  content.replaceChildren(fragment);
}

function scheduleRender(index) {
  const item = state[index];
  if (!item || item.frame) return;
  item.frame = requestAnimationFrame(() => {
    item.frame = 0;
    render(index);
  });
}

function buildDiffMap(diffs, paneIndex, currentDiff) {
  const map = new Map();
  if (!Array.isArray(diffs)) return map;
  for (let diffIndex = 0; diffIndex < diffs.length; diffIndex += 1) {
    const diff = diffs[diffIndex];
    const line = Number(paneIndex === 0 ? diff.leftLine : diff.rightLine);
    if (!Number.isInteger(line) || line <= 0) continue;
    const type = diff.type === 'added' || diff.type === 'removed' ? diff.type : 'modified';
    const existing = map.get(line);
    map.set(line, {
      type: existing?.type === 'modified' ? 'modified' : type,
      current: existing?.current || diffIndex === currentDiff,
    });
  }
  return map;
}

function appendSelectedText(node, text, absoluteStart, selection) {
  if (!selection || selection.end <= absoluteStart || selection.start >= absoluteStart + text.length || selection.start === selection.end) {
    node.textContent = text || ' ';
    return;
  }
  const start = Math.max(0, selection.start - absoluteStart);
  const end = Math.min(text.length, selection.end - absoluteStart);
  if (start > 0) node.append(document.createTextNode(text.slice(0, start)));
  const mark = document.createElement('mark');
  mark.className = 'smart-wrap-selection';
  mark.textContent = text.slice(start, end) || ' ';
  node.appendChild(mark);
  if (end < text.length) node.append(document.createTextNode(text.slice(end)));
}

function editorSelection(index) {
  const editor = editors[index];
  if (!editor) return null;
  return {
    start: Math.min(editor.selectionStart || 0, editor.selectionEnd || 0),
    end: Math.max(editor.selectionStart || 0, editor.selectionEnd || 0),
  };
}

function beginSourceEdit(index, line) {
  const editor = editors[index];
  const item = state[index];
  if (!editor || !item) return;
  item.editing = true;
  updateVisibility(index);
  const safeLine = Math.max(1, Math.min(Number(line) || 1, item.lines.length));
  const offset = item.lineStarts[safeLine - 1] || 0;
  const nativeLineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
  editor.scrollTop = Math.max(0, (safeLine - 1) * nativeLineHeight - editor.clientHeight * 0.38);
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(offset, offset + item.lines[safeLine - 1].length);
  try {
    window.PayloadDiffDiagnostics?.log?.('debug', 'smart-wrap.edit-started', { pane: index + 1, line: safeLine });
  } catch (_) {}
}

function finishSourceEdit(index) {
  const item = state[index];
  if (!item?.editing) return;
  item.editing = false;
  rebuild(index, true);
  updateVisibility(index);
  revealOffset(index, editors[index]?.selectionStart || 0, 0.38);
  try {
    window.PayloadDiffDiagnostics?.log?.('debug', 'smart-wrap.edit-ended', { pane: index + 1 });
  } catch (_) {}
}

function syncScroll(index) {
  if (globalSyncLock || !syncInput?.checked) return;
  const source = surfaces[index];
  if (!source || !state[index].active) return;
  const other = index === 0 ? 1 : 0;
  const targetSurface = surfaces[other];
  globalSyncLock = true;
  try {
    if (state[other]?.active && targetSurface) {
      const sourceMax = Math.max(1, source.scrollHeight - source.clientHeight);
      const targetMax = Math.max(0, targetSurface.scrollHeight - targetSurface.clientHeight);
      targetSurface.scrollTop = (source.scrollTop / sourceMax) * targetMax;
      scheduleRender(other);
    } else if (editors[other]) {
      const sourceMax = Math.max(1, source.scrollHeight - source.clientHeight);
      const targetMax = Math.max(0, editors[other].scrollHeight - editors[other].clientHeight);
      editors[other].scrollTop = (source.scrollTop / sourceMax) * targetMax;
    }
  } finally {
    requestAnimationFrame(() => { globalSyncLock = false; });
  }
}

function revealCurrentDifference(detail) {
  const diffs = Array.isArray(detail?.diffs) ? detail.diffs : [];
  const index = Number(detail?.currentDiffIndex);
  if (!Number.isInteger(index) || !diffs[index]) return;
  for (let paneIndex = 0; paneIndex < 2; paneIndex += 1) {
    if (!state[paneIndex]?.active) continue;
    const diff = diffs[index];
    const line = Number(paneIndex === 0 ? (diff.leftLine || diff.rightLine) : (diff.rightLine || diff.leftLine));
    if (Number.isInteger(line) && line > 0) revealLine(paneIndex, line, 0.42);
  }
}

function revealOffset(index, offset, viewportRatio = 0.42) {
  const item = state[index];
  if (!item?.lines?.length) return false;
  const line = lineForOffset(item.lineStarts, Math.max(0, Number(offset) || 0));
  return revealLine(index, line, viewportRatio);
}

function revealLine(index, line, viewportRatio = 0.42, { silent = false } = {}) {
  const surface = surfaces[index];
  const item = state[index];
  if (!surface || !item?.lines?.length || !item.active) return false;
  const safeLine = Math.max(1, Math.min(Number(line) || 1, item.lines.length));
  const top = item.rowTops[safeLine - 1] || 0;
  surface.scrollTop = Math.max(0, top - surface.clientHeight * viewportRatio);
  if (!silent) scheduleRender(index);
  return true;
}

function smartLineMetrics(index, line) {
  const item = state[index];
  if (!item?.lines?.length) return null;
  const safeLine = Math.max(1, Math.min(Number(line) || 1, item.lines.length));
  return {
    line: safeLine,
    top: item.rowTops[safeLine - 1] || 0,
    height: item.rowHeights[safeLine - 1] || item.lineHeight,
    rows: item.layouts[safeLine - 1]?.rows || 1,
    lineHeight: item.lineHeight,
    columnsPerRow: item.columns,
    continuationColumn: item.layouts[safeLine - 1]?.continuationColumn || 0,
  };
}

function visibleLineRange(index, overscan = 2) {
  const item = state[index];
  const surface = surfaces[index];
  if (!item?.lines?.length || !surface) return { first: 1, last: 1 };
  return {
    first: Math.max(1, lineIndexAtY(item, surface.scrollTop) + 1 - overscan),
    last: Math.min(item.lines.length, lineIndexAtY(item, surface.scrollTop + surface.clientHeight) + 1 + overscan),
  };
}

function lineIndexAtY(item, y) {
  const tops = item.rowTops;
  if (!tops.length) return 0;
  const target = Math.max(0, Number(y) || 0);
  let low = 0;
  let high = tops.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (tops[middle] <= target) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, Math.min(tops.length - 1, high));
}

function lineForOffset(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(1, high + 1);
}

function lineAtEditorScroll(index) {
  const editor = editors[index];
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
  return Math.max(1, Math.floor((editor.scrollTop || 0) / lineHeight) + 1);
}

function isWrapEnabled(index) {
  return !!window.PayloadDiffWordWrap?.isEnabled?.(index);
}

function publicState(index) {
  const item = state[index];
  const surface = surfaces[index];
  return {
    pane: index + 1,
    active: !!item?.active,
    editing: !!item?.editing,
    columns: item?.columns || 0,
    lines: item?.lines?.length || 0,
    totalHeight: Math.round(item?.totalHeight || 0),
    scrollTop: Math.round(surface?.scrollTop || 0),
    continuationStrategy: 'hanging-indent',
    maxColumns: SMART_WRAP_MAX_COLUMNS,
  };
}

function measureCharWidth(style) {
  const canvas = measureCharWidth.canvas || (measureCharWidth.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  if (!context) return (parseFloat(style.fontSize) || 13) * .62;
  context.font = `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${style.fontSize || '13px'} ${style.fontFamily || 'monospace'}`;
  return context.measureText('M').width || (parseFloat(style.fontSize) || 13) * .62;
}

function installAlignedWrapObserver() {
  const observer = new MutationObserver(() => refreshAlignedSmartWrap());
  document.querySelectorAll('.aligned-compare-content').forEach((content) => observer.observe(content, { childList: true, subtree: true }));
}

function refreshAlignedSmartWrap() {
  document.querySelectorAll('.aligned-compare-view').forEach((surface) => {
    const paneIndex = Number(surface.dataset.pane);
    if (!Number.isInteger(paneIndex) || !isWrapEnabled(paneIndex)) return;
    const editor = editors[paneIndex];
    if (!editor) return;
    const style = getComputedStyle(editor);
    const charWidth = measureCharWidth(style);
    const tabSize = Math.max(1, parseInt(style.tabSize, 10) || 2);
    const columns = Math.max(24, Math.min(SMART_WRAP_MAX_COLUMNS, Math.floor(((surface.clientWidth || 700) - 106) / charWidth)));
    surface.querySelectorAll('.aligned-compare-text:not(.placeholder)').forEach((textNode) => {
      const layout = smartWrapLayout(textNode.textContent || '', columns, tabSize);
      const hangingPx = layout.continuationColumn * charWidth;
      textNode.style.setProperty('--pd-aligned-hanging', `${hangingPx}px`);
    });
  });
}

function installStyles() {
  if (document.querySelector('#smart-wrap-view-styles')) return;
  const style = document.createElement('style');
  style.id = 'smart-wrap-view-styles';
  style.textContent = `
    .smart-wrap-view {
      position: absolute;
      z-index: 22;
      inset: 0;
      overflow: auto;
      background: #0b1221;
      color: #e5edf9;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 13px;
      line-height: var(--pd-smart-line-height, 20px);
      tab-size: 2;
      outline: none;
    }
    .smart-wrap-content { position: relative; min-width: 100%; }
    .smart-wrap-spacer { width: 1px; opacity: 0; pointer-events: none; }
    .smart-wrap-row {
      position: absolute;
      left: 0;
      right: 0;
      display: flex;
      align-items: stretch;
      border-left: 4px solid transparent;
      user-select: text;
    }
    .smart-wrap-gutter {
      flex: 0 0 78px;
      width: 78px;
      padding-right: 11px;
      display: block;
      text-align: right;
      color: #71809d;
      background: #0b1221;
      border-right: 1px solid #253149;
      line-height: var(--pd-smart-line-height, 20px);
      user-select: none;
    }
    .smart-wrap-text {
      flex: 1 1 auto;
      min-width: 0;
      padding: 0 14px;
      overflow: hidden;
      white-space: normal;
    }
    .smart-wrap-segment {
      display: block;
      min-height: var(--pd-smart-line-height, 20px);
      line-height: var(--pd-smart-line-height, 20px);
      white-space: pre;
      overflow: hidden;
      text-overflow: clip;
    }
    .smart-wrap-segment.continuation {
      color: inherit;
    }
    .smart-wrap-row.diff-added { background: rgba(34,197,94,.16); border-left-color: #22c55e; }
    .smart-wrap-row.diff-removed { background: rgba(239,68,68,.17); border-left-color: #ef4444; }
    .smart-wrap-row.diff-modified { background: rgba(245,158,11,.18); border-left-color: #f59e0b; }
    .smart-wrap-row.current { outline: 2px solid rgba(96,165,250,.95); outline-offset: -2px; z-index: 1; }
    .smart-wrap-row.syntax-error { box-shadow: inset 3px 0 0 #ef4444; }
    .smart-wrap-selection {
      padding: 0;
      color: inherit;
      background: rgba(96,165,250,.38);
      border-radius: 2px;
    }
    .smart-wrap-row:hover { background-color: rgba(96,165,250,.07); }

    /* Smart Wrap owns the visible Code surface. The real editor remains intact
       underneath so payload contents, selection state and editing are never
       rewritten by the projection. */
    .editor-wrap.smart-wrap-active > .editor-line-gutter,
    .editor-wrap.smart-wrap-active > .editor-indent-guides,
    .editor-wrap.smart-wrap-active > .editor-diff-overlay,
    .editor-wrap.smart-wrap-active > .inline-diff-layer,
    .editor-wrap.smart-wrap-active > .wrap-diff-layer,
    .editor-wrap.smart-wrap-active > .wrap-syntax-layer,
    .editor-wrap.smart-wrap-active > .syntax-line-layer,
    .editor-wrap.smart-wrap-active > .code-fold-gutter,
    .editor-wrap.smart-wrap-active > .fold-code-view {
      visibility: hidden !important;
      pointer-events: none !important;
    }

    /* Aligned comparison rows are one logical source line each, so CSS hanging
       indentation can be applied safely there as well. */
    .editor-wrap:has(.editor.word-wrap-enabled) .aligned-compare-text:not(.placeholder) {
      max-width: calc(120ch + 28px);
      padding-left: calc(14px + var(--pd-aligned-hanging, 0px));
      text-indent: calc(-1 * var(--pd-aligned-hanging, 0px));
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: normal;
    }

    html[data-theme="light"] .smart-wrap-view,
    html[data-theme="light"] .smart-wrap-gutter {
      background: #ffffff;
      color: #1e293b;
    }
    html[data-theme="light"] .smart-wrap-gutter {
      background: #f8fafc;
      color: #64748b;
      border-color: #d6dee9;
    }
    html[data-theme="light"] .smart-wrap-row.diff-added { background: rgba(34,197,94,.12); }
    html[data-theme="light"] .smart-wrap-row.diff-removed { background: rgba(239,68,68,.12); }
    html[data-theme="light"] .smart-wrap-row.diff-modified { background: rgba(245,158,11,.14); }
    html[data-theme="light"] .smart-wrap-row.current { outline-color: #2563eb; }
    html[data-theme="light"] .smart-wrap-selection { background: rgba(37,99,235,.22); }
  `;
  document.head.appendChild(style);
}
