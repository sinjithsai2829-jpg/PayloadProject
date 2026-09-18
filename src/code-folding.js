import { findFoldRanges } from './fold-ranges.js';

const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');

const paneState = editors.map(() => ({
  ranges: [],
  rangeByStart: new Map(),
  collapsed: new Set(),
  projection: [],
  rowTops: [],
  rowHeights: [],
  totalHeight: 0,
  layoutDirty: true,
  foldedView: null,
  foldedContent: null,
  foldGutter: null,
  renderFrame: 0,
  refreshTimer: 0,
  editing: false,
}));

let latestDiffs = [];
let latestDiffIndex = -1;
let mirrorLock = false;

const CHEVRON_DOWN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>';

installStyles();
for (let index = 0; index < editors.length; index += 1) installPane(index);
installGlobalHooks();
refreshAll(true);

window.PayloadDiffCodeFolding = {
  getState: () => paneState.map((state) => [...state.collapsed].sort((a, b) => a - b)),
  setState: (value, options = {}) => restoreFoldState(value, options),
  refresh: () => refreshAll(true),
  expandAll: (index = null) => {
    if (index == null) {
      for (let pane = 0; pane < paneState.length; pane += 1) setCollapsedLines(pane, []);
    } else setCollapsedLines(index, []);
  },
};

function installPane(index) {
  const editor = editors[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!editor || !wrap) return;

  const foldGutter = document.createElement('div');
  foldGutter.className = 'code-fold-gutter';
  foldGutter.setAttribute('aria-label', `File ${index + 1} code folding`);
  wrap.appendChild(foldGutter);
  paneState[index].foldGutter = foldGutter;

  const foldedView = document.createElement('div');
  foldedView.className = 'fold-code-view hidden';
  foldedView.tabIndex = 0;
  foldedView.setAttribute('aria-label', `File ${index + 1} folded code view`);
  const foldedContent = document.createElement('div');
  foldedContent.className = 'fold-code-content';
  foldedView.appendChild(foldedContent);
  wrap.appendChild(foldedView);
  paneState[index].foldedView = foldedView;
  paneState[index].foldedContent = foldedContent;

  foldGutter.addEventListener('click', (event) => {
    const button = event.target.closest('.code-fold-toggle[data-line]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    toggleFold(index, Number(button.dataset.line), true);
  });

  foldedView.addEventListener('click', (event) => {
    const button = event.target.closest('.fold-row-toggle[data-line]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    toggleFold(index, Number(button.dataset.line), true);
  });

  foldedView.addEventListener('dblclick', (event) => {
    if (event.target.closest('button')) return;
    const row = event.target.closest('.fold-code-row[data-original-line]');
    if (!row) return;
    beginEditing(index, Number(row.dataset.originalLine));
  });

  foldedView.addEventListener('scroll', () => scheduleFoldRender(index), { passive: true });
  editor.addEventListener('scroll', () => renderExpandedFoldGutter(index), { passive: true });
  editor.addEventListener('input', () => {
    paneState[index].editing = false;
    if (paneState[index].collapsed.size) paneState[index].collapsed.clear();
    scheduleStructureRefresh(index, 120, true);
  });
  editor.addEventListener('blur', () => {
    if (!paneState[index].editing) return;
    paneState[index].editing = false;
    applySurface(index);
  });

  panes[index]?.querySelector('.view-tabs')?.addEventListener('click', () => requestAnimationFrame(() => applySurface(index)));

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      invalidateLayout(index);
      renderExpandedFoldGutter(index);
      scheduleFoldRender(index);
    });
    observer.observe(wrap);
  }
}

function installGlobalHooks() {
  for (const button of [document.querySelector('#formatBtn'), document.querySelector('#compareBtn')].filter(Boolean)) {
    button.addEventListener('click', refreshAfterBusy, true);
  }

  document.querySelector('#clearBtn')?.addEventListener('click', () => requestAnimationFrame(() => {
    for (let index = 0; index < paneState.length; index += 1) {
      paneState[index].collapsed.clear();
      paneState[index].ranges = [];
      paneState[index].rangeByStart.clear();
      rebuildProjection(index);
      applySurface(index);
    }
  }), true);

  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => requestAnimationFrame(() => {
      for (const state of paneState) state.collapsed.clear();
      refreshAll(true);
    }), true);
  });

  document.querySelectorAll('.file-input').forEach((input) => {
    input.addEventListener('change', () => setTimeout(() => refreshAll(true), 0));
  });

  window.addEventListener('payloaddiff:live-compare-updated', (event) => {
    latestDiffs = Array.isArray(event.detail?.diffs) ? event.detail.diffs : [];
    latestDiffIndex = Number.isInteger(event.detail?.currentDiffIndex) ? event.detail.currentDiffIndex : -1;
    revealCurrentDifference();
    scheduleFoldRender(0);
    scheduleFoldRender(1);
  });

  window.addEventListener('payloaddiff:diff-selection-changed', (event) => {
    const nextIndex = Number(event.detail?.currentDiffIndex);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex === latestDiffIndex) return;
    latestDiffIndex = nextIndex;
    revealCurrentDifference();
    scheduleFoldRender(0);
    scheduleFoldRender(1);
  });

  window.addEventListener('payloaddiff:comparison-reset', () => {
    latestDiffs = [];
    latestDiffIndex = -1;
    scheduleFoldRender(0);
    scheduleFoldRender(1);
  });

  for (const type of ['payloaddiff:word-wrap-changed', 'payloaddiff:word-wrap-layout']) {
    window.addEventListener(type, (event) => {
      const requested = Number(event.detail?.paneIndex);
      const targets = Number.isInteger(requested) ? [requested] : [0, 1];
      for (const index of targets) {
        invalidateLayout(index);
        renderExpandedFoldGutter(index);
        scheduleFoldRender(index);
      }
    });
  }
}

function refreshAfterBusy() {
  let sawBusy = document.body.classList.contains('busy');
  const started = performance.now();
  const poll = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if ((sawBusy && !document.body.classList.contains('busy')) || performance.now() - started > 30000) {
      refreshAll(true);
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

function scheduleStructureRefresh(index, delay, clearCollapsed) {
  clearTimeout(paneState[index].refreshTimer);
  paneState[index].refreshTimer = window.setTimeout(() => {
    if (clearCollapsed) paneState[index].collapsed.clear();
    refreshPane(index, true);
  }, delay);
}

function refreshAll(preserveCollapsed) {
  for (let index = 0; index < paneState.length; index += 1) refreshPane(index, preserveCollapsed);
}

function refreshPane(index, preserveCollapsed) {
  const editor = editors[index];
  const state = paneState[index];
  if (!editor || !state) return;

  const ranges = findFoldRanges(currentMode(), editor.value);
  state.ranges = ranges;
  state.rangeByStart = new Map(ranges.map((range) => [range.startLine, range]));

  if (preserveCollapsed) {
    state.collapsed = new Set([...state.collapsed].filter((line) => state.rangeByStart.has(line)));
  } else state.collapsed.clear();

  rebuildProjection(index);
  applySurface(index);
  renderExpandedFoldGutter(index);
  scheduleFoldRender(index);
}

function toggleFold(index, startLine, mirror) {
  const state = paneState[index];
  const range = state.rangeByStart.get(startLine);
  if (!range) return;

  const anchorLine = visibleAnchorLine(index);
  const collapsing = !state.collapsed.has(startLine);
  if (collapsing) state.collapsed.add(startLine);
  else state.collapsed.delete(startLine);
  state.editing = false;

  rebuildProjection(index);
  applySurface(index);
  scrollSurfaceToOriginalLine(index, anchorLine);
  notifyFoldState(index);

  if (mirror && syncInput?.checked && !mirrorLock) mirrorFold(index, range, collapsing);
}

function mirrorFold(sourceIndex, sourceRange, collapsing) {
  const targetIndex = sourceIndex === 0 ? 1 : 0;
  const target = paneState[targetIndex];
  if (!target) return;

  const sourceLines = Math.max(1, lineCount(editors[sourceIndex]?.value || ''));
  const targetLines = Math.max(1, lineCount(editors[targetIndex]?.value || ''));
  const expected = Math.round((sourceRange.startLine / sourceLines) * targetLines);
  let candidate = target.rangeByStart.get(sourceRange.startLine) || null;
  if (!candidate) {
    let bestDistance = Infinity;
    for (const range of target.ranges) {
      if (range.kind !== sourceRange.kind) continue;
      const distance = Math.abs(range.startLine - expected);
      if (distance < bestDistance) {
        bestDistance = distance;
        candidate = range;
      }
      if (distance === 0) break;
    }
  }
  if (!candidate) return;

  mirrorLock = true;
  if (collapsing) target.collapsed.add(candidate.startLine);
  else target.collapsed.delete(candidate.startLine);
  rebuildProjection(targetIndex);
  applySurface(targetIndex);
  notifyFoldState(targetIndex);
  requestAnimationFrame(() => { mirrorLock = false; });
}

function rebuildProjection(index) {
  const state = paneState[index];
  const lines = String(editors[index]?.value || '').split('\n');
  const projection = [];

  for (let line = 1; line <= lines.length; line += 1) {
    const range = state.rangeByStart.get(line);
    if (range && state.collapsed.has(line)) {
      projection.push({
        originalLine: line,
        endLine: range.endLine,
        text: collapsedLabel(lines, range),
        collapsed: true,
        range,
      });
      line = range.endLine;
      continue;
    }
    projection.push({
      originalLine: line,
      endLine: line,
      text: lines[line - 1] ?? '',
      collapsed: false,
      range,
    });
  }

  state.projection = projection;
  invalidateLayout(index);
}

function collapsedLabel(lines, range) {
  const open = lines[range.startLine - 1] ?? '';
  const close = (lines[range.endLine - 1] ?? '').trim();
  if (range.kind === 'element') {
    const openTrimmed = open.trimEnd();
    const closing = close || `</${range.name || '…'}>`;
    return `${openTrimmed}  …  ${closing.startsWith('</') ? closing : `</${range.name || '…'}>`}`;
  }
  if (range.kind === 'comment') return `${open.trimEnd()} … -->`;
  if (range.kind === 'cdata') return `${open.trimEnd()} … ]]>`;
  return `${open.trimEnd()}  …  ${close || (range.kind === 'array' ? ']' : '}')}`;
}

function applySurface(index) {
  const state = paneState[index];
  const editor = editors[index];
  const treeActive = panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
  const folded = !treeActive && !state.editing && state.collapsed.size > 0;

  state.foldedView?.classList.toggle('hidden', !folded);
  state.foldGutter?.classList.toggle('hidden', treeActive || folded || state.editing);
  editor?.closest('.editor-wrap')?.classList.toggle('folding-active', folded);
  if (folded) scheduleFoldRender(index);
  else renderExpandedFoldGutter(index);
}

function renderExpandedFoldGutter(index) {
  const state = paneState[index];
  const editor = editors[index];
  const gutter = state.foldGutter;
  if (!editor || !gutter || gutter.classList.contains('hidden')) return;

  const wrapApi = window.PayloadDiffWordWrap;
  const wrapped = !!wrapApi?.isEnabled?.(index);
  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const visible = wrapped
    ? (wrapApi.getVisibleLineRange?.(index, 4) || { first: 1, last: state.ranges.at(-1)?.endLine || 1 })
    : {
        first: Math.max(1, Math.floor((editor.scrollTop - paddingTop) / lineHeight) + 1 - 3),
        last: Math.ceil((editor.scrollTop + editor.clientHeight - paddingTop) / lineHeight) + 3,
      };
  const fragment = document.createDocumentFragment();

  for (const range of state.ranges) {
    if (range.startLine < visible.first) continue;
    if (range.startLine > visible.last) break;
    const metrics = wrapped ? wrapApi.getLineMetrics?.(index, range.startLine) : null;
    const top = metrics?.top ?? (paddingTop + (range.startLine - 1) * lineHeight);
    const button = createFoldButton(range.startLine, false, 'code-fold-toggle');
    button.style.top = `${top - editor.scrollTop}px`;
    button.style.height = `${metrics?.lineHeight || lineHeight}px`;
    fragment.appendChild(button);
  }
  gutter.replaceChildren(fragment);
}

function invalidateLayout(index) {
  const state = paneState[index];
  if (!state) return;
  state.layoutDirty = true;
}

function ensureProjectionLayout(index) {
  const state = paneState[index];
  const editor = editors[index];
  if (!state || !editor || !state.layoutDirty) return;

  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const wrapApi = window.PayloadDiffWordWrap;
  const wrapped = !!wrapApi?.isEnabled?.(index);
  const rowTops = new Array(state.projection.length);
  const rowHeights = new Array(state.projection.length);
  let top = 0;

  for (let rowIndex = 0; rowIndex < state.projection.length; rowIndex += 1) {
    const item = state.projection[rowIndex];
    rowTops[rowIndex] = top;
    let height = lineHeight;
    if (wrapped) {
      const metrics = item.collapsed
        ? wrapApi.getTextMetrics?.(index, item.text)
        : wrapApi.getLineMetrics?.(index, item.originalLine);
      height = Math.max(lineHeight, metrics?.height || lineHeight);
    }
    rowHeights[rowIndex] = height;
    top += height;
  }

  state.rowTops = rowTops;
  state.rowHeights = rowHeights;
  state.totalHeight = top;
  state.layoutDirty = false;
}

function scheduleFoldRender(index) {
  const state = paneState[index];
  if (!state?.foldedView || state.foldedView.classList.contains('hidden')) return;
  if (state.renderFrame) return;
  state.renderFrame = requestAnimationFrame(() => {
    state.renderFrame = 0;
    renderFoldedSurface(index);
  });
}

function renderFoldedSurface(index) {
  const state = paneState[index];
  const view = state.foldedView;
  const content = state.foldedContent;
  if (!view || !content || view.classList.contains('hidden')) return;

  ensureProjectionLayout(index);
  const editorStyle = getComputedStyle(editors[index]);
  const lineHeight = parseFloat(editorStyle.lineHeight) || 20;
  const paddingTop = parseFloat(editorStyle.paddingTop) || 14;
  const overscan = 8;
  const firstRow = Math.max(0, rowAtY(state, Math.max(0, view.scrollTop - paddingTop)) - overscan);
  const lastRow = Math.min(state.projection.length - 1, rowAtY(state, view.scrollTop + view.clientHeight - paddingTop) + overscan);
  const diffMap = diffTypesForPane(index);
  const currentLine = currentDiffLine(index);
  const fragment = document.createDocumentFragment();

  const spacer = document.createElement('div');
  spacer.className = 'fold-code-spacer';
  spacer.style.height = `${paddingTop * 2 + state.totalHeight}px`;
  if (!window.PayloadDiffWordWrap?.isEnabled?.(index)) {
    spacer.style.width = `${Math.max(view.clientWidth, editors[index]?.scrollWidth || view.clientWidth)}px`;
  }
  fragment.appendChild(spacer);

  for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex += 1) {
    const item = state.projection[rowIndex];
    if (!item) continue;

    const row = document.createElement('div');
    row.className = 'fold-code-row';
    row.dataset.originalLine = String(item.originalLine);
    row.style.top = `${paddingTop + (state.rowTops[rowIndex] || 0)}px`;
    row.style.height = `${state.rowHeights[rowIndex] || lineHeight}px`;
    row.style.lineHeight = `${lineHeight}px`;

    const hiddenDiff = item.collapsed ? diffTypeInsideRange(index, item.originalLine, item.endLine) : null;
    const type = diffMap.get(item.originalLine) || hiddenDiff;
    if (type) row.classList.add(`fold-diff-${type}`);
    if (currentLine && currentLine >= item.originalLine && currentLine <= item.endLine) row.classList.add('fold-diff-current');
    if (item.collapsed) row.classList.add('collapsed');

    const gutter = document.createElement('span');
    gutter.className = 'fold-row-gutter';

    if (item.range) gutter.appendChild(createFoldButton(item.range.startLine, item.collapsed, 'fold-row-toggle'));
    else {
      const spacerToggle = document.createElement('span');
      spacerToggle.className = 'fold-row-toggle-spacer';
      gutter.appendChild(spacerToggle);
    }

    const number = document.createElement('span');
    number.className = 'fold-row-number';
    number.textContent = item.originalLine.toLocaleString();
    gutter.appendChild(number);
    row.appendChild(gutter);

    const text = document.createElement('span');
    text.className = 'fold-row-text';
    text.textContent = item.text;
    text.title = item.collapsed
      ? `Lines ${item.originalLine.toLocaleString()}–${item.endLine.toLocaleString()} collapsed`
      : 'Double-click to edit this line';
    appendIndentGuides(text, item.text, editorStyle);
    row.appendChild(text);
    fragment.appendChild(row);
  }

  content.replaceChildren(fragment);
}

function rowAtY(state, y) {
  const tops = state.rowTops;
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

function createFoldButton(line, collapsed, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.line = String(line);
  button.innerHTML = collapsed ? CHEVRON_RIGHT : CHEVRON_DOWN;
  button.title = collapsed ? 'Expand block' : 'Collapse block';
  button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} block at line ${line}`);
  return button;
}

function appendIndentGuides(textNode, lineText, style) {
  const indentation = lineText.match(/^[ \t]+/)?.[0] || '';
  if (!indentation) return;
  const columns = indentation.replace(/\t/g, '  ').length;
  const unit = inferIndentUnitForCurrentText(lineText) || 2;
  const depth = Math.floor(columns / unit);
  if (!depth) return;
  const charWidth = measureCharWidth(style);
  for (let level = 1; level <= depth; level += 1) {
    const guide = document.createElement('i');
    guide.className = 'fold-indent-guide';
    guide.style.left = `${level * unit * charWidth}px`;
    textNode.appendChild(guide);
  }
}

function beginEditing(index, originalLine) {
  const state = paneState[index];
  const editor = editors[index];
  if (!state || !editor) return;
  state.editing = true;
  applySurface(index);
  const wrapApi = window.PayloadDiffWordWrap;
  editor.scrollTop = wrapApi?.isEnabled?.(index)
    ? wrapApi.scrollTopForLine(index, originalLine, 0.18)
    : Math.max(0, (originalLine - 2) * (parseFloat(getComputedStyle(editor).lineHeight) || 20));
  const offset = offsetForLine(editor.value, originalLine);
  editor.focus();
  editor.setSelectionRange(offset, offset);
}

function restoreFoldState(value, { notify = false } = {}) {
  const pair = Array.isArray(value) ? value : [];
  refreshAll(true);
  for (let index = 0; index < paneState.length; index += 1) {
    setCollapsedLines(index, Array.isArray(pair[index]) ? pair[index] : [], false);
  }
  if (notify) window.dispatchEvent(new CustomEvent('payloaddiff:fold-state-changed', { detail: { foldedRanges: window.PayloadDiffCodeFolding.getState() } }));
}

function setCollapsedLines(index, lines, notify = true) {
  const state = paneState[index];
  if (!state) return;
  state.collapsed = new Set(lines
    .map((line) => Number(line))
    .filter((line) => Number.isInteger(line) && state.rangeByStart.has(line)));
  state.editing = false;
  rebuildProjection(index);
  applySurface(index);
  if (notify) notifyFoldState(index);
}

function notifyFoldState(index) {
  window.dispatchEvent(new CustomEvent('payloaddiff:fold-state-changed', {
    detail: {
      paneIndex: index,
      foldedRanges: window.PayloadDiffCodeFolding?.getState?.() || [],
    },
  }));
}

function revealCurrentDifference() {
  const diff = latestDiffs[latestDiffIndex];
  if (!diff) return;
  for (let index = 0; index < paneState.length; index += 1) {
    const line = index === 0 ? (diff.leftLine || diff.rightLine) : (diff.rightLine || diff.leftLine);
    if (!line) continue;
    const state = paneState[index];
    let changed = false;
    for (const startLine of [...state.collapsed]) {
      const range = state.rangeByStart.get(startLine);
      if (range && line > range.startLine && line <= range.endLine) {
        state.collapsed.delete(startLine);
        changed = true;
      }
    }
    if (changed) {
      rebuildProjection(index);
      applySurface(index);
      notifyFoldState(index);
    }
    if (state.collapsed.size) scrollSurfaceToOriginalLine(index, line);
  }
}

function diffTypesForPane(index) {
  const map = new Map();
  for (const diff of latestDiffs) {
    const line = index === 0 ? diff.leftLine : diff.rightLine;
    if (!line) continue;
    let type = diff.type;
    if (type === 'added' && index === 0) continue;
    if (type === 'removed' && index === 1) continue;
    if (type !== 'added' && type !== 'removed') type = 'modified';
    map.set(line, type);
  }
  return map;
}

function diffTypeInsideRange(index, startLine, endLine) {
  let result = null;
  for (const diff of latestDiffs) {
    const line = index === 0 ? diff.leftLine : diff.rightLine;
    if (!line || line <= startLine || line > endLine) continue;
    const type = diff.type === 'added' || diff.type === 'removed' ? diff.type : 'modified';
    if (!result) result = type;
    else if (result !== type) return 'modified';
  }
  return result;
}

function currentDiffLine(index) {
  const diff = latestDiffs[latestDiffIndex];
  if (!diff) return null;
  return index === 0 ? (diff.leftLine || diff.rightLine) : (diff.rightLine || diff.leftLine);
}

function visibleAnchorLine(index) {
  const state = paneState[index];
  if (state.collapsed.size && !state.foldedView.classList.contains('hidden')) {
    ensureProjectionLayout(index);
    const paddingTop = parseFloat(getComputedStyle(editors[index]).paddingTop) || 0;
    const row = rowAtY(state, Math.max(0, state.foldedView.scrollTop - paddingTop));
    return state.projection[row]?.originalLine || 1;
  }
  const wrapApi = window.PayloadDiffWordWrap;
  if (wrapApi?.isEnabled?.(index)) return wrapApi.lineAtContentY(index, editors[index].scrollTop);
  const lineHeight = parseFloat(getComputedStyle(editors[index]).lineHeight) || 20;
  return Math.max(1, Math.floor(editors[index].scrollTop / lineHeight) + 1);
}

function scrollSurfaceToOriginalLine(index, line) {
  const state = paneState[index];
  const editor = editors[index];
  if (!state || !editor) return;
  if (state.collapsed.size && !state.foldedView.classList.contains('hidden')) {
    ensureProjectionLayout(index);
    const rowIndex = projectionIndexForLine(state.projection, line);
    const top = state.rowTops[rowIndex] || 0;
    state.foldedView.scrollTop = Math.max(0, top - state.foldedView.clientHeight * .18);
    scheduleFoldRender(index);
  } else {
    const wrapApi = window.PayloadDiffWordWrap;
    editor.scrollTop = wrapApi?.isEnabled?.(index)
      ? wrapApi.scrollTopForLine(index, line, .18)
      : Math.max(0, (line - 1) * (parseFloat(getComputedStyle(editor).lineHeight) || 20) - editor.clientHeight * .18);
  }
}

function projectionIndexForLine(projection, line) {
  let low = 0;
  let high = projection.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const item = projection[middle];
    if (line < item.originalLine) high = middle - 1;
    else if (line > item.endLine) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(projection.length - 1, low));
}

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode === 'xml' ? 'xml' : 'json';
}

function offsetForLine(text, line) {
  if (line <= 1) return 0;
  let current = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10 && ++current === line) return index + 1;
  }
  return text.length;
}

function lineCount(text) {
  if (!text) return 1;
  let count = 1;
  for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) count += 1;
  return count;
}

function inferIndentUnitForCurrentText(line) {
  const spaces = line.match(/^ +/)?.[0]?.length || 0;
  if (!spaces) return 2;
  if (spaces % 2 === 0) return 2;
  return 1;
}

function measureCharWidth(style) {
  const canvas = measureCharWidth.canvas || (measureCharWidth.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  if (!context) return (parseFloat(style.fontSize) || 13) * .61;
  context.font = `${style.fontWeight || '400'} ${style.fontSize || '13px'} ${style.fontFamily || 'monospace'}`;
  return context.measureText(' ').width || (parseFloat(style.fontSize) || 13) * .61;
}

function installStyles() {
  if (document.querySelector('#code-folding-styles')) return;
  const style = document.createElement('style');
  style.id = 'code-folding-styles';
  style.textContent = `
    .code-fold-gutter {
      position: absolute;
      z-index: 9;
      left: 4px;
      top: 0;
      bottom: 0;
      width: 22px;
      overflow: hidden;
      pointer-events: auto;
    }
    .code-fold-toggle,
    .fold-row-toggle {
      width: 20px;
      min-width: 20px;
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: #91a1bf;
      cursor: pointer;
    }
    .code-fold-toggle { position: absolute; left: 0; }
    .code-fold-toggle:hover,
    .fold-row-toggle:hover { background: #1a2740; color: #dbeafe; }
    .code-fold-toggle svg,
    .fold-row-toggle svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
    }

    .fold-code-view {
      position: absolute;
      z-index: 10;
      inset: 0;
      overflow: auto;
      background: #0b1221;
      color: #e5edf9;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 13px;
      line-height: 1.55;
      tab-size: 2;
      outline: none;
    }
    .fold-code-content { position: relative; min-width: 100%; }
    .fold-code-spacer { opacity: 0; pointer-events: none; }
    .fold-code-row {
      position: absolute;
      left: 0;
      min-width: 100%;
      width: max-content;
      display: flex;
      white-space: pre;
      border-left: 4px solid transparent;
    }
    .fold-code-row:hover { background: #121e33; }
    .fold-code-row.collapsed { background: rgba(59,130,246,.055); }
    .fold-code-row.fold-diff-added { background: rgba(34,197,94,.16); border-left-color: #4ade80; }
    .fold-code-row.fold-diff-removed { background: rgba(239,68,68,.17); border-left-color: #f87171; }
    .fold-code-row.fold-diff-modified { background: rgba(245,158,11,.18); border-left-color: #fbbf24; }
    .fold-code-row.fold-diff-current { outline: 1px solid rgba(96,165,250,.92); outline-offset: -1px; }
    .fold-row-gutter {
      position: sticky;
      left: 0;
      z-index: 2;
      flex: 0 0 var(--pd-code-gutter-width, 78px);
      width: var(--pd-code-gutter-width, 78px);
      display: flex;
      align-items: flex-start;
      background: #0b1221;
      border-right: 1px solid #253149;
      user-select: none;
    }
    .fold-code-row:hover .fold-row-gutter,
    .fold-code-row.collapsed .fold-row-gutter { background: #101a2d; }
    .fold-row-toggle,
    .fold-row-toggle-spacer { flex: 0 0 22px; width: 22px; height: 20px; }
    .fold-row-number {
      flex: 1;
      min-width: 0;
      padding-right: 10px;
      text-align: right;
      color: #71809d;
      font-size: 12px;
    }
    .fold-row-text {
      position: relative;
      display: block;
      min-width: max-content;
      padding: 0 14px;
    }
    .fold-code-row.collapsed .fold-row-text { color: #b7c5da; }
    .fold-indent-guide {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: rgba(112,133,171,.28);
      pointer-events: none;
    }
    .editor-wrap.folding-active > .editor,
    .editor-wrap.folding-active > .editor-line-gutter,
    .editor-wrap.folding-active > .editor-indent-guides,
    .editor-wrap.folding-active > .editor-diff-overlay,
    .editor-wrap.folding-active > .inline-diff-layer,
    .editor-wrap.folding-active > .syntax-line-layer,
    .editor-wrap.folding-active > .wrap-diff-layer,
    .editor-wrap.folding-active > .wrap-syntax-layer {
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}
