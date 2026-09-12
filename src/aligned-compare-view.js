import { buildAlignedRows, changedTextRange } from './alignment-model.js';

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');
const surfaces = [];
const contents = [];
const frames = [0, 0];

let model = null;
let diffs = [];
let currentDiffIndex = -1;
let active = false;
let editing = false;
let rowTops = [];
let rowHeights = [];
let totalHeight = 0;
let syncLock = false;

installStyles();
for (let index = 0; index < editors.length; index += 1) installPane(index);

window.PayloadDiffAlignedCompare = {
  isActive: () => active && !editing,
  getPlaceholderCount: () => model?.placeholderCount || 0,
  revealDiff: (index) => revealDiff(Number(index)),
  resume: () => {
    editing = false;
    rebuildFromCurrentState();
  },
};

window.addEventListener('payloaddiff:live-compare-updated', (event) => {
  const detail = event.detail || {};
  diffs = Array.isArray(detail.diffs) ? detail.diffs : [];
  const previousIndex = currentDiffIndex;
  currentDiffIndex = Number.isInteger(detail.currentDiffIndex) ? detail.currentDiffIndex : -1;
  editing = false;
  rebuildFromCurrentState();
  if (currentDiffIndex >= 0 && currentDiffIndex !== previousIndex) requestAnimationFrame(() => revealDiff(currentDiffIndex));
});

window.addEventListener('payloaddiff:comparison-reset', reset);
window.addEventListener('payloaddiff:word-wrap-changed', () => {
  if (!active) return;
  rebuildLayout();
  renderAll();
});
window.addEventListener('payloaddiff:word-wrap-layout', () => {
  if (!active) return;
  rebuildLayout();
  renderAll();
});
window.addEventListener('payloaddiff:view-surface-synced', () => updateVisibility());
window.addEventListener('payloaddiff:theme-changed', () => renderAll());

function installPane(index) {
  const editor = editors[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!editor || !wrap) return;

  const surface = document.createElement('div');
  surface.className = 'aligned-compare-view hidden';
  surface.tabIndex = 0;
  surface.dataset.pane = String(index);
  surface.setAttribute('aria-label', `File ${index + 1} aligned comparison`);

  const content = document.createElement('div');
  content.className = 'aligned-compare-content';
  surface.appendChild(content);
  wrap.appendChild(surface);
  surfaces[index] = surface;
  contents[index] = content;

  surface.addEventListener('scroll', () => {
    scheduleRender(index);
    if (!active || editing || !syncInput?.checked || syncLock) return;
    const other = index === 0 ? 1 : 0;
    const target = surfaces[other];
    if (!target || target.classList.contains('hidden')) return;
    syncLock = true;
    target.scrollTop = surface.scrollTop;
    if (!isWrapped(index) && !isWrapped(other)) target.scrollLeft = surface.scrollLeft;
    scheduleRender(other);
    requestAnimationFrame(() => { syncLock = false; });
  }, { passive: true });

  surface.addEventListener('click', (event) => {
    const row = event.target.closest('.aligned-compare-row[data-row-index]');
    if (!row) return;
    const rowIndex = Number(row.dataset.rowIndex);
    const diffIndex = model?.rows?.[rowIndex]?.diffIndexes?.[0];
    if (Number.isInteger(diffIndex)) window.PayloadDiffCompareSession?.goToIndex?.(diffIndex);
  });

  surface.addEventListener('dblclick', (event) => {
    const row = event.target.closest('.aligned-compare-row[data-row-index]');
    if (!row) return;
    event.preventDefault();
    const rowIndex = Number(row.dataset.rowIndex);
    const item = model?.rows?.[rowIndex];
    const line = index === 0 ? item?.leftLine : item?.rightLine;
    if (line) beginEditing(index, line);
  });

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      if (!active) return;
      rebuildLayout();
      scheduleRender(index);
      scheduleRender(index === 0 ? 1 : 0);
    });
    observer.observe(wrap);
  }
}

function rebuildFromCurrentState() {
  const hasAlignmentGap = diffs.some((diff) => (!!positiveLine(diff?.leftLine)) !== (!!positiveLine(diff?.rightLine)));
  active = hasAlignmentGap;
  if (!active) {
    model = null;
    updateVisibility();
    return;
  }

  model = buildAlignedRows(editors[0]?.value || '', editors[1]?.value || '', diffs);
  rebuildLayout();
  updateVisibility();
  renderAll();

  try {
    window.PayloadDiffDiagnostics?.log?.('info', 'comparison.alignment-built', {
      diffCount: diffs.length,
      alignedRows: model.rows.length,
      placeholderRows: model.placeholderCount,
      currentDiffIndex,
      wordWrap: [isWrapped(0), isWrapped(1)],
    });
  } catch (_) {}
}

function rebuildLayout() {
  if (!model?.rows?.length) {
    rowTops = [];
    rowHeights = [];
    totalHeight = 0;
    return;
  }

  const metrics = editors.map((editor, index) => editorMetrics(editor, index));
  rowTops = new Array(model.rows.length);
  rowHeights = new Array(model.rows.length);
  let top = 0;

  for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex += 1) {
    const row = model.rows[rowIndex];
    rowTops[rowIndex] = top;
    const leftText = row.leftLine ? model.leftLines[row.leftLine - 1] || '' : '';
    const rightText = row.rightLine ? model.rightLines[row.rightLine - 1] || '' : '';
    const leftHeight = visualLineHeight(leftText, metrics[0]);
    const rightHeight = visualLineHeight(rightText, metrics[1]);
    const height = Math.max(metrics[0].lineHeight, metrics[1].lineHeight, leftHeight, rightHeight);
    rowHeights[rowIndex] = height;
    top += height;
  }
  totalHeight = top;
}

function editorMetrics(editor, index) {
  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const charWidth = measureCharWidth(style);
  const gutterWidth = 78;
  const horizontalPadding = 28;
  const width = Math.max(charWidth * 8, (editor?.clientWidth || 600) - gutterWidth - horizontalPadding);
  return {
    lineHeight,
    charWidth,
    wrap: isWrapped(index),
    columns: Math.max(8, Math.floor(width / Math.max(1, charWidth))),
    tabSize: Math.max(1, parseInt(style.tabSize, 10) || 2),
  };
}

function visualLineHeight(text, metrics) {
  if (!metrics.wrap) return metrics.lineHeight;
  const columns = visualColumns(text, metrics.tabSize);
  const rows = Math.max(1, Math.ceil(Math.max(1, columns) / metrics.columns));
  return rows * metrics.lineHeight;
}

function updateVisibility() {
  for (let index = 0; index < panes.length; index += 1) {
    const treeActive = panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
    const show = active && !editing && !treeActive;
    const wrap = editors[index]?.closest('.editor-wrap');
    surfaces[index]?.classList.toggle('hidden', !show);
    wrap?.classList.toggle('aligned-compare-active', show);
    if (show) scheduleRender(index);
  }
}

function renderAll() {
  scheduleRender(0);
  scheduleRender(1);
}

function scheduleRender(index) {
  if (frames[index]) return;
  frames[index] = requestAnimationFrame(() => {
    frames[index] = 0;
    render(index);
  });
}

function render(index) {
  const surface = surfaces[index];
  const content = contents[index];
  if (!surface || !content || surface.classList.contains('hidden') || !model?.rows?.length) return;

  const overscan = 8;
  const first = Math.max(0, rowAtY(surface.scrollTop) - overscan);
  const last = Math.min(model.rows.length - 1, rowAtY(surface.scrollTop + surface.clientHeight) + overscan);
  const fragment = document.createDocumentFragment();

  const spacer = document.createElement('div');
  spacer.className = 'aligned-compare-spacer';
  spacer.style.height = `${Math.max(totalHeight, surface.clientHeight)}px`;
  fragment.appendChild(spacer);

  for (let rowIndex = first; rowIndex <= last; rowIndex += 1) {
    const item = model.rows[rowIndex];
    const row = document.createElement('div');
    row.className = rowClass(item, index);
    row.dataset.rowIndex = String(rowIndex);
    row.style.top = `${rowTops[rowIndex]}px`;
    row.style.height = `${rowHeights[rowIndex]}px`;
    row.style.minHeight = `${rowHeights[rowIndex]}px`;

    const line = index === 0 ? item.leftLine : item.rightLine;
    const counterpart = index === 0 ? item.rightLine : item.leftLine;
    const gutter = document.createElement('span');
    gutter.className = 'aligned-compare-gutter';
    gutter.textContent = line ? line.toLocaleString() : '—';
    row.appendChild(gutter);

    const text = document.createElement('span');
    text.className = 'aligned-compare-text';
    if (!line) {
      text.classList.add('placeholder');
      text.textContent = 'no corresponding line';
      text.title = 'Visual alignment spacer only — this line does not exist in this payload.';
    } else {
      const value = index === 0 ? model.leftLines[line - 1] || '' : model.rightLines[line - 1] || '';
      appendRowText(text, value, item, index, counterpart);
      text.title = item.type ? 'Double-click to edit this source line.' : '';
    }
    row.appendChild(text);
    fragment.appendChild(row);
  }

  content.replaceChildren(fragment);
}

function appendRowText(node, value, item, paneIndex, counterpartLine) {
  if (item.type !== 'modified' || !counterpartLine || item.leftLine == null || item.rightLine == null) {
    node.textContent = value;
    return;
  }

  const left = model.leftLines[item.leftLine - 1] || '';
  const right = model.rightLines[item.rightLine - 1] || '';
  const range = changedTextRange(left, right);
  const start = paneIndex === 0 ? range.leftStart : range.rightStart;
  const end = paneIndex === 0 ? range.leftEnd : range.rightEnd;
  if (end <= start) {
    node.textContent = value;
    return;
  }

  node.append(document.createTextNode(value.slice(0, start)));
  const changed = document.createElement('mark');
  changed.className = 'aligned-inline-change';
  changed.textContent = value.slice(start, end);
  node.append(changed, document.createTextNode(value.slice(end)));
}

function rowClass(item, paneIndex) {
  const line = paneIndex === 0 ? item.leftLine : item.rightLine;
  const classes = ['aligned-compare-row'];
  if (item.type) classes.push(`diff-${item.type}`);
  if (!line) classes.push('missing-line');
  if (item.diffIndexes.includes(currentDiffIndex)) classes.push('current');
  return classes.join(' ');
}

function revealDiff(index) {
  if (!active || editing || !model) return false;
  const rowIndex = model.rowForDiff?.[index];
  if (!Number.isInteger(rowIndex) || rowIndex < 0) return false;
  currentDiffIndex = index;
  const top = rowTops[rowIndex] || 0;
  for (const surface of surfaces) {
    if (!surface || surface.classList.contains('hidden')) continue;
    surface.scrollTop = Math.max(0, top - surface.clientHeight * .42);
  }
  renderAll();
  return true;
}

function beginEditing(index, line) {
  const editor = editors[index];
  if (!editor) return;
  editing = true;
  updateVisibility();
  const offset = offsetForLine(editor.value, line);
  const wrapApi = window.PayloadDiffWordWrap;
  editor.scrollTop = wrapApi?.isEnabled?.(index)
    ? wrapApi.scrollTopForLine(index, line, .35)
    : Math.max(0, (line - 1) * (parseFloat(getComputedStyle(editor).lineHeight) || 20) - editor.clientHeight * .35);
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(offset, offset);
  try {
    window.PayloadDiffDiagnostics?.log?.('info', 'comparison.alignment-edit-entered', { paneIndex: index, line });
  } catch (_) {}
}

function rowAtY(y) {
  if (!rowTops.length) return 0;
  const target = Math.max(0, Number(y) || 0);
  let low = 0;
  let high = rowTops.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (rowTops[middle] <= target) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, Math.min(rowTops.length - 1, high));
}

function isWrapped(index) {
  return !!window.PayloadDiffWordWrap?.isEnabled?.(index);
}

function offsetForLine(text, line) {
  if (line <= 1) return 0;
  let current = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10 && ++current === line) return index + 1;
  }
  return text.length;
}

function positiveLine(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
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

function reset() {
  active = false;
  editing = false;
  model = null;
  diffs = [];
  currentDiffIndex = -1;
  rowTops = [];
  rowHeights = [];
  totalHeight = 0;
  for (let index = 0; index < panes.length; index += 1) {
    surfaces[index]?.classList.add('hidden');
    editors[index]?.closest('.editor-wrap')?.classList.remove('aligned-compare-active');
    contents[index]?.replaceChildren();
  }
}

function installStyles() {
  if (document.querySelector('#aligned-compare-styles')) return;
  const style = document.createElement('style');
  style.id = 'aligned-compare-styles';
  style.textContent = `
    .aligned-compare-view {
      position: absolute;
      z-index: 20;
      inset: 0;
      overflow: auto;
      background: #0b1221;
      color: #e5edf9;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 13px;
      line-height: 1.55;
      tab-size: 2;
      outline: none;
      scrollbar-color: #647896 #08101d;
    }
    .aligned-compare-content { position: relative; min-width: 100%; }
    .aligned-compare-spacer { width: 1px; opacity: 0; pointer-events: none; }
    .aligned-compare-row {
      position: absolute;
      left: 0;
      min-width: 100%;
      width: max-content;
      display: flex;
      align-items: stretch;
      white-space: pre;
      border-left: 4px solid transparent;
      cursor: default;
    }
    .aligned-compare-gutter {
      position: sticky;
      left: 0;
      z-index: 2;
      flex: 0 0 78px;
      width: 78px;
      padding: 0 11px 0 25px;
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      line-height: 20px;
      color: #71809d;
      background: #0b1221;
      border-right: 1px solid #253149;
      user-select: none;
    }
    .aligned-compare-text {
      display: block;
      min-width: max-content;
      padding: 0 14px;
      line-height: 20px;
    }
    .word-wrap-enabled ~ .aligned-compare-view .aligned-compare-row,
    .editor-wrap:has(.editor.word-wrap-enabled) .aligned-compare-row {
      width: 100%;
      min-width: 100%;
    }
    .editor-wrap:has(.editor.word-wrap-enabled) .aligned-compare-text {
      min-width: 0;
      width: calc(100% - 78px);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-all;
    }
    .aligned-compare-row.diff-added { background: rgba(34,197,94,.18); border-left-color: #4ade80; }
    .aligned-compare-row.diff-removed { background: rgba(239,68,68,.19); border-left-color: #f87171; }
    .aligned-compare-row.diff-modified { background: rgba(245,158,11,.18); border-left-color: #fbbf24; }
    .aligned-compare-row.current { outline: 2px solid rgba(96,165,250,.95); outline-offset: -2px; z-index: 1; }
    .aligned-compare-row.missing-line {
      background-image: repeating-linear-gradient(-45deg, rgba(148,163,184,.04) 0, rgba(148,163,184,.04) 6px, rgba(148,163,184,.10) 6px, rgba(148,163,184,.10) 12px);
    }
    .aligned-compare-row.missing-line.diff-removed { background-color: rgba(239,68,68,.10); }
    .aligned-compare-row.missing-line.diff-added { background-color: rgba(34,197,94,.09); }
    .aligned-compare-text.placeholder {
      color: #73829c;
      font-size: 11px;
      font-style: italic;
      letter-spacing: .01em;
      user-select: none;
    }
    .aligned-inline-change {
      padding: 0;
      border-radius: 2px;
      color: inherit;
      background: rgba(251,191,36,.42);
      box-shadow: inset 0 -2px 0 rgba(251,191,36,.9);
    }
    .aligned-compare-row.diff-removed .aligned-inline-change { background: rgba(248,113,113,.42); }
    .aligned-compare-row.diff-added .aligned-inline-change { background: rgba(74,222,128,.38); }

    .editor-wrap.aligned-compare-active > .editor,
    .editor-wrap.aligned-compare-active > .fold-code-view,
    .editor-wrap.aligned-compare-active > .code-fold-gutter,
    .editor-wrap.aligned-compare-active > .editor-line-gutter,
    .editor-wrap.aligned-compare-active > .editor-indent-guides,
    .editor-wrap.aligned-compare-active > .editor-diff-overlay,
    .editor-wrap.aligned-compare-active > .inline-diff-layer,
    .editor-wrap.aligned-compare-active > .syntax-line-layer,
    .editor-wrap.aligned-compare-active > .syntax-error-rail {
      visibility: hidden !important;
      pointer-events: none !important;
    }

    html[data-theme="light"] .aligned-compare-view,
    html[data-theme="light"] .aligned-compare-gutter {
      background: #ffffff;
      color: #1e293b;
    }
    html[data-theme="light"] .aligned-compare-gutter { color: #64748b; border-color: #d6dee9; background: #f8fafc; }
    html[data-theme="light"] .aligned-compare-row.diff-added { background-color: rgba(34,197,94,.12); }
    html[data-theme="light"] .aligned-compare-row.diff-removed { background-color: rgba(239,68,68,.12); }
    html[data-theme="light"] .aligned-compare-row.diff-modified { background-color: rgba(245,158,11,.14); }
    html[data-theme="light"] .aligned-compare-row.missing-line {
      background-image: repeating-linear-gradient(-45deg, rgba(100,116,139,.035) 0, rgba(100,116,139,.035) 6px, rgba(100,116,139,.09) 6px, rgba(100,116,139,.09) 12px);
    }
    html[data-theme="light"] .aligned-compare-text.placeholder { color: #64748b; }
    html[data-theme="light"] .aligned-compare-row.current { outline-color: #2563eb; }
    html[data-theme="light"] .aligned-inline-change { background: rgba(245,158,11,.30); box-shadow: inset 0 -2px 0 #d97706; }
  `;
  document.head.appendChild(style);
}
