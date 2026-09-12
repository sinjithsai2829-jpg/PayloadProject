import {
  LARGE_PAYLOAD_THRESHOLD_CHARS,
  LARGE_PAYLOAD_THRESHOLD_BYTES,
  LARGE_PAYLOAD_MAX_PHYSICAL_SCROLL,
  lineBounds,
  logicalOffsetFromPhysical,
  physicalExtent,
  physicalOffsetFromLogical,
  shouldUseLargePayloadMode,
  shouldUseLargePayloadModeForFile,
  visibleCharacterWindow,
  visibleLineWindow,
} from './large-payload-model.js';

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');
const worker = new Worker(new URL('./large-payload-worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
let workerSeq = 0;
let syncLock = false;

const state = editors.map(() => ({
  active: false,
  indexing: false,
  request: 0,
  lineStarts: new Uint32Array([0]),
  lineCount: 1,
  maxLineLength: 0,
  textLength: 0,
  lineHeight: 20,
  charWidth: 8,
  gutterWidth: 78,
  logicalHeight: 20,
  logicalWidth: 0,
  logicalScrollTop: 0,
  logicalScrollLeft: 0,
  frame: 0,
  controlledInput: false,
  diffMap: new Map(),
  currentDiffLine: null,
  source: '',
}));
const surfaces = [];
const spacers = [];
const layers = [];
const badges = [];
const editorsUi = [];

worker.onmessage = ({ data }) => {
  const item = pending.get(data.id);
  if (!item) return;
  pending.delete(data.id);
  data.ok ? item.resolve(data.result) : item.reject(new Error(data.error || 'Large payload worker failed.'));
};

installStyles();
for (let index = 0; index < editors.length; index += 1) installPane(index);
installGlobalHooks();

window.PayloadDiffLargePayload = {
  thresholdChars: LARGE_PAYLOAD_THRESHOLD_CHARS,
  thresholdBytes: LARGE_PAYLOAD_THRESHOLD_BYTES,
  maxPhysicalScroll: LARGE_PAYLOAD_MAX_PHYSICAL_SCROLL,
  isLarge: (index) => !!state[index]?.active,
  shouldVirtualizeText: (value) => shouldUseLargePayloadMode(value),
  shouldVirtualizeSize: (bytes) => shouldUseLargePayloadModeForFile(bytes),
  replace: (index, text, options = {}) => replacePayload(index, text, options),
  readFile: (index, file, options = {}) => readLargeFile(index, file, options),
  refresh: (index = null) => {
    if (index == null) editors.forEach((_, paneIndex) => refreshMetrics(paneIndex, true));
    else refreshMetrics(index, true);
  },
  revealLine: (index, line, viewportRatio = 0.42) => revealLine(index, line, viewportRatio),
  getScroller: (index) => state[index]?.active ? surfaces[index] : null,
  getState: (index) => publicState(index),
};

function installPane(index) {
  const editor = editors[index];
  const pane = panes[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!editor || !pane || !wrap) return;

  const surface = document.createElement('div');
  surface.className = 'large-payload-view hidden';
  surface.dataset.pane = String(index);
  surface.tabIndex = 0;
  surface.setAttribute('role', 'textbox');
  surface.setAttribute('aria-multiline', 'true');
  surface.setAttribute('aria-label', `File ${index + 1} virtualized large payload view`);

  const spacer = document.createElement('div');
  spacer.className = 'large-payload-spacer';
  const layer = document.createElement('div');
  layer.className = 'large-payload-layer';
  surface.append(spacer, layer);

  const badge = document.createElement('div');
  badge.className = 'large-payload-badge hidden';
  badge.textContent = 'Large payload · virtualized';
  wrap.append(surface, badge);

  surfaces[index] = surface;
  spacers[index] = spacer;
  layers[index] = layer;
  badges[index] = badge;

  surface.addEventListener('scroll', () => {
    updateLogicalScroll(index);
    scheduleRender(index);
    syncScroll(index);
  }, { passive: true });

  surface.addEventListener('dblclick', (event) => {
    const row = event.target.closest('.large-payload-row[data-line-index]');
    if (!row) return;
    event.preventDefault();
    openSegmentEditor(index, Number(row.dataset.lineIndex), Number(row.dataset.charStart), Number(row.dataset.charEnd));
  });

  surface.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text) return;
    event.preventDefault();
    replacePayload(index, text, { source: 'large-view-paste', dispatchInput: true }).catch(reportError);
  });

  editor.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!shouldUseLargePayloadMode(text)) return;
    event.preventDefault();
    replacePayload(index, text, { source: 'native-paste', dispatchInput: true }).catch(reportError);
  }, { capture: true });

  editor.addEventListener('input', () => {
    const item = state[index];
    if (item.controlledInput) return;
    const length = editor.value.length;
    if (shouldUseLargePayloadMode(length)) {
      activate(index, 'editor-input');
      indexCurrentText(index).catch(reportError);
    } else if (item.active) {
      deactivate(index, 'payload-became-small');
    }
  });

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      if (!state[index].active) return;
      refreshMetrics(index, true);
    });
    observer.observe(wrap);
    observer.observe(surface);
  }
}

function installGlobalHooks() {
  window.addEventListener('payloaddiff:view-surface-synced', (event) => {
    const index = Number(event.detail?.paneIndex);
    if (Number.isInteger(index)) updateVisibility(index);
    else editors.forEach((_, paneIndex) => updateVisibility(paneIndex));
  });

  window.addEventListener('payloaddiff:live-compare-updated', (event) => {
    const detail = event.detail || {};
    const diffs = Array.isArray(detail.diffs) ? detail.diffs : [];
    const current = Number(detail.currentDiffIndex);
    for (let index = 0; index < state.length; index += 1) {
      const map = new Map();
      let currentLine = null;
      for (let diffIndex = 0; diffIndex < diffs.length; diffIndex += 1) {
        const diff = diffs[diffIndex];
        const line = Number(index === 0 ? diff.leftLine : diff.rightLine);
        if (!Number.isInteger(line) || line <= 0) continue;
        let type = diff.type === 'added' || diff.type === 'removed' ? diff.type : 'modified';
        const existing = map.get(line);
        if (existing === 'modified' || existing && existing !== type) type = 'modified';
        map.set(line, type);
        if (diffIndex === current) currentLine = line;
      }
      state[index].diffMap = map;
      state[index].currentDiffLine = currentLine;
      scheduleRender(index);
      if (state[index].active && currentLine) revealLine(index, currentLine, 0.42);
    }
  });

  window.addEventListener('payloaddiff:comparison-reset', () => {
    for (let index = 0; index < state.length; index += 1) {
      state[index].diffMap = new Map();
      state[index].currentDiffLine = null;
      scheduleRender(index);
    }
  });

  document.querySelector('#clearBtn')?.addEventListener('click', () => requestAnimationFrame(() => {
    for (let index = 0; index < state.length; index += 1) {
      if (!editors[index]?.value) deactivate(index, 'clear');
    }
  }), true);
}

async function replacePayload(index, text, { source = 'api', dispatchInput = true, indexed = null } = {}) {
  const editor = editors[index];
  const item = state[index];
  if (!editor || !item) return String(text ?? '');
  const value = String(text ?? '');
  const large = shouldUseLargePayloadMode(value.length);

  if (large) activate(index, source);
  item.controlledInput = true;
  try {
    editor.value = value;
    if (dispatchInput) editor.dispatchEvent(new Event('input', { bubbles: true }));
  } finally {
    item.controlledInput = false;
  }

  if (!large) {
    deactivate(index, 'small-replacement');
    return value;
  }

  if (indexed) applyIndex(index, indexed, source);
  else await indexCurrentText(index, source);
  return value;
}

async function readLargeFile(index, file, { dispatchInput = true, source = 'upload' } = {}) {
  if (!file) return '';
  if (!shouldUseLargePayloadModeForFile(file.size)) {
    const text = await file.text();
    await replacePayload(index, text, { source, dispatchInput });
    return text;
  }

  activate(index, source);
  setIndexing(index, true);
  const request = ++state[index].request;
  try {
    const result = await runWorker('readFile', { file });
    if (request !== state[index].request) return result.text;
    await replacePayload(index, result.text, { source, dispatchInput, indexed: result });
    return result.text;
  } finally {
    if (request === state[index].request) setIndexing(index, false);
  }
}

async function indexCurrentText(index, source = 'input') {
  const editor = editors[index];
  const item = state[index];
  if (!editor || !item?.active) return;
  const request = ++item.request;
  setIndexing(index, true);
  try {
    const result = await runWorker('index', { text: editor.value });
    if (request !== item.request || !item.active) return;
    applyIndex(index, result, source);
  } finally {
    if (request === item.request) setIndexing(index, false);
  }
}

function runWorker(task, payload) {
  return new Promise((resolve, reject) => {
    const id = ++workerSeq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, task, payload });
  });
}

function applyIndex(index, result, source) {
  const item = state[index];
  if (!item) return;
  item.lineStarts = result.lineStarts instanceof Uint32Array ? result.lineStarts : new Uint32Array(result.lineStarts || [0]);
  item.lineCount = Math.max(1, Number(result.lineCount) || item.lineStarts.length || 1);
  item.maxLineLength = Math.max(0, Number(result.maxLineLength) || 0);
  item.textLength = Math.max(0, Number(result.textLength) || editors[index]?.value.length || 0);
  item.source = source || item.source;
  refreshMetrics(index, true);
  window.dispatchEvent(new CustomEvent('payloaddiff:large-payload-indexed', {
    detail: publicState(index),
  }));
}

function activate(index, source) {
  const item = state[index];
  const pane = panes[index];
  const editor = editors[index];
  if (!item || !pane || !editor) return;
  const wasActive = item.active;
  item.active = true;
  item.source = source || item.source;

  const codeButton = pane.querySelector('.view-btn[data-view="code"]');
  if (pane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active')) codeButton?.click();

  pane.classList.add('large-payload-pane');
  editor.closest('.editor-wrap')?.classList.add('large-payload-active');
  setExpensiveControls(index, true);
  updateVisibility(index);
  if (!wasActive) {
    window.dispatchEvent(new CustomEvent('payloaddiff:large-payload-mode-changed', {
      detail: { paneIndex: index, active: true, source: item.source, chars: editor.value.length },
    }));
  }
}

function deactivate(index, reason) {
  const item = state[index];
  const pane = panes[index];
  const editor = editors[index];
  if (!item || !pane || !editor || !item.active) return;
  item.active = false;
  item.indexing = false;
  item.request += 1;
  item.lineStarts = new Uint32Array([0]);
  item.lineCount = 1;
  item.maxLineLength = 0;
  item.textLength = editor.value.length;
  item.diffMap = new Map();
  item.currentDiffLine = null;
  pane.classList.remove('large-payload-pane');
  editor.closest('.editor-wrap')?.classList.remove('large-payload-active');
  surfaces[index]?.classList.add('hidden');
  badges[index]?.classList.add('hidden');
  layers[index]?.replaceChildren();
  closeSegmentEditor(index, false);
  setExpensiveControls(index, false);
  window.dispatchEvent(new CustomEvent('payloaddiff:large-payload-mode-changed', {
    detail: { paneIndex: index, active: false, reason, chars: editor.value.length },
  }));
}

function setExpensiveControls(index, disabled) {
  const pane = panes[index];
  const wrapButton = pane?.querySelector('.word-wrap-toggle');
  const treeButton = pane?.querySelector('.view-btn[data-view="tree"]');
  if (wrapButton) {
    wrapButton.disabled = disabled;
    wrapButton.dataset.largePayloadDisabled = disabled ? 'true' : 'false';
    if (disabled) wrapButton.title = 'Wrap is disabled for very large payloads to keep scrolling fluid.';
  }
  if (treeButton) {
    treeButton.disabled = disabled;
    treeButton.dataset.largePayloadDisabled = disabled ? 'true' : 'false';
    if (disabled) treeButton.title = 'Tree view is disabled for very large payloads to protect browser responsiveness.';
  }
}

function updateVisibility(index) {
  const item = state[index];
  const pane = panes[index];
  const surface = surfaces[index];
  const badge = badges[index];
  if (!item || !pane || !surface) return;
  const treeActive = pane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
  const show = item.active && !treeActive;
  surface.classList.toggle('hidden', !show);
  badge?.classList.toggle('hidden', !show);
  if (show) {
    refreshMetrics(index, false);
    scheduleRender(index);
  }
  try { window.PayloadDiffScrollbars?.refresh?.(index); } catch (_) {}
}

function refreshMetrics(index, preserveLogicalScroll) {
  const item = state[index];
  const editor = editors[index];
  const surface = surfaces[index];
  const spacer = spacers[index];
  if (!item?.active || !editor || !surface || !spacer) return;

  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const charWidth = measureCharWidth(style);
  const gutterWidth = 78;
  const logicalHeight = Math.max(surface.clientHeight || lineHeight, item.lineCount * lineHeight + 28);
  const logicalWidth = Math.max(surface.clientWidth || 1, gutterWidth + item.maxLineLength * charWidth + 40);
  const oldTop = item.logicalScrollTop;
  const oldLeft = item.logicalScrollLeft;

  Object.assign(item, { lineHeight, charWidth, gutterWidth, logicalHeight, logicalWidth });
  const physicalHeight = physicalExtent(logicalHeight, surface.clientHeight);
  const physicalWidth = physicalExtent(logicalWidth, surface.clientWidth);
  spacer.style.height = `${physicalHeight}px`;
  spacer.style.width = `${physicalWidth}px`;

  if (preserveLogicalScroll) {
    surface.scrollTop = physicalOffsetFromLogical({
      logicalOffset: oldTop,
      physicalExtent: physicalHeight,
      viewportExtent: surface.clientHeight,
      logicalExtent: logicalHeight,
    });
    surface.scrollLeft = physicalOffsetFromLogical({
      logicalOffset: oldLeft,
      physicalExtent: physicalWidth,
      viewportExtent: surface.clientWidth,
      logicalExtent: logicalWidth,
    });
  }
  updateLogicalScroll(index);
  scheduleRender(index);
}

function updateLogicalScroll(index) {
  const item = state[index];
  const surface = surfaces[index];
  const spacer = spacers[index];
  if (!item?.active || !surface || !spacer) return;
  item.logicalScrollTop = logicalOffsetFromPhysical({
    physicalOffset: surface.scrollTop,
    physicalExtent: spacer.offsetHeight,
    viewportExtent: surface.clientHeight,
    logicalExtent: item.logicalHeight,
  });
  item.logicalScrollLeft = logicalOffsetFromPhysical({
    physicalOffset: surface.scrollLeft,
    physicalExtent: spacer.offsetWidth,
    viewportExtent: surface.clientWidth,
    logicalExtent: item.logicalWidth,
  });
}

function scheduleRender(index) {
  const item = state[index];
  if (!item?.active || item.frame) return;
  item.frame = requestAnimationFrame(() => {
    item.frame = 0;
    render(index);
  });
}

function render(index) {
  const item = state[index];
  const surface = surfaces[index];
  const layer = layers[index];
  const editor = editors[index];
  if (!item?.active || !surface || !layer || !editor || surface.classList.contains('hidden')) return;

  if (item.indexing || !item.lineStarts?.length) {
    layer.replaceChildren(statusRow(surface, 'Indexing large payload…'));
    return;
  }

  const lineWindow = visibleLineWindow({
    logicalScrollTop: item.logicalScrollTop,
    viewportHeight: surface.clientHeight,
    lineHeight: item.lineHeight,
    lineCount: item.lineCount,
  });
  const fragment = document.createDocumentFragment();

  for (let lineIndex = lineWindow.first; lineIndex <= lineWindow.last; lineIndex += 1) {
    const bounds = lineBounds(item.lineStarts, item.textLength, lineIndex);
    const lineLength = Math.max(0, bounds.end - bounds.start);
    const charWindow = visibleCharacterWindow({
      logicalScrollLeft: item.logicalScrollLeft,
      viewportWidth: surface.clientWidth,
      gutterWidth: item.gutterWidth,
      charWidth: item.charWidth,
      lineLength,
    });
    const row = document.createElement('div');
    const lineNumber = lineIndex + 1;
    const diffType = item.diffMap.get(lineNumber);
    row.className = `large-payload-row${diffType ? ` diff-${diffType}` : ''}${item.currentDiffLine === lineNumber ? ' current' : ''}`;
    row.dataset.lineIndex = String(lineIndex);
    row.dataset.charStart = String(charWindow.first);
    row.dataset.charEnd = String(charWindow.last);
    row.style.top = `${surface.scrollTop + lineIndex * item.lineHeight - item.logicalScrollTop}px`;
    row.style.left = `${surface.scrollLeft}px`;
    row.style.width = `${surface.clientWidth}px`;
    row.style.height = `${item.lineHeight}px`;
    row.style.lineHeight = `${item.lineHeight}px`;

    const gutter = document.createElement('span');
    gutter.className = 'large-payload-gutter';
    gutter.textContent = lineNumber.toLocaleString();
    gutter.style.width = `${item.gutterWidth}px`;

    const text = document.createElement('span');
    text.className = 'large-payload-text';
    text.style.left = `${item.gutterWidth + charWindow.first * item.charWidth - item.logicalScrollLeft}px`;
    text.textContent = editor.value.slice(bounds.start + charWindow.first, bounds.start + charWindow.last) || ' ';
    row.append(gutter, text);
    fragment.appendChild(row);
  }
  layer.replaceChildren(fragment);
}

function statusRow(surface, message) {
  const row = document.createElement('div');
  row.className = 'large-payload-status-row';
  row.style.top = `${surface.scrollTop + 24}px`;
  row.style.left = `${surface.scrollLeft + 24}px`;
  row.textContent = message;
  return row;
}

function revealLine(index, line, viewportRatio = 0.42) {
  const item = state[index];
  const surface = surfaces[index];
  const spacer = spacers[index];
  if (!item?.active || !surface || !spacer) return false;
  const safeLine = Math.max(1, Math.min(item.lineCount, Number(line) || 1));
  const logicalTop = Math.max(0, (safeLine - 1) * item.lineHeight - surface.clientHeight * viewportRatio);
  surface.scrollTop = physicalOffsetFromLogical({
    logicalOffset: logicalTop,
    physicalExtent: spacer.offsetHeight,
    viewportExtent: surface.clientHeight,
    logicalExtent: item.logicalHeight,
  });
  updateLogicalScroll(index);
  scheduleRender(index);
  return true;
}

function syncScroll(index) {
  if (syncLock || !syncInput?.checked || !state[index]?.active) return;
  const other = index === 0 ? 1 : 0;
  if (!state[other]?.active) return;
  const source = surfaces[index];
  const target = surfaces[other];
  if (!source || !target) return;

  syncLock = true;
  const sourceMaxY = Math.max(1, source.scrollHeight - source.clientHeight);
  const targetMaxY = Math.max(0, target.scrollHeight - target.clientHeight);
  const sourceMaxX = Math.max(1, source.scrollWidth - source.clientWidth);
  const targetMaxX = Math.max(0, target.scrollWidth - target.clientWidth);
  target.scrollTop = (source.scrollTop / sourceMaxY) * targetMaxY;
  target.scrollLeft = (source.scrollLeft / sourceMaxX) * targetMaxX;
  updateLogicalScroll(other);
  scheduleRender(other);
  requestAnimationFrame(() => { syncLock = false; });
}

function setIndexing(index, value) {
  state[index].indexing = !!value;
  badges[index].textContent = value ? 'Large payload · indexing…' : 'Large payload · virtualized';
  scheduleRender(index);
}

function openSegmentEditor(index, lineIndex, charStart, charEnd) {
  const item = state[index];
  const editor = editors[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!item?.active || !editor || !wrap) return;
  closeSegmentEditor(index, false);

  const bounds = lineBounds(item.lineStarts, item.textLength, lineIndex);
  const lineLength = Math.max(0, bounds.end - bounds.start);
  let start = 0;
  let end = lineLength;
  if (lineLength > 50_000) {
    start = Math.max(0, charStart - 1000);
    end = Math.min(lineLength, Math.max(charEnd + 1000, start + 2000));
  }

  const panel = document.createElement('div');
  panel.className = 'large-payload-segment-editor';
  panel.innerHTML = `
    <div class="large-payload-segment-head">
      <strong>Line ${(lineIndex + 1).toLocaleString()}</strong>
      <span>${lineLength > 50_000 ? `Editing characters ${(start + 1).toLocaleString()}–${end.toLocaleString()} of ${lineLength.toLocaleString()}` : 'Editing full line'}</span>
    </div>
    <textarea spellcheck="false" aria-label="Edit large payload line segment"></textarea>
    <div class="large-payload-segment-actions">
      <button type="button" data-action="cancel">Cancel</button>
      <button type="button" data-action="save" class="primary">Save segment</button>
    </div>
  `;
  const input = panel.querySelector('textarea');
  input.value = editor.value.slice(bounds.start + start, bounds.start + end);
  panel.querySelector('[data-action="cancel"]')?.addEventListener('click', () => closeSegmentEditor(index, false));
  panel.querySelector('[data-action="save"]')?.addEventListener('click', () => saveSegment(index));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSegmentEditor(index, false);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveSegment(index);
    }
  });
  panel.dataset.lineIndex = String(lineIndex);
  panel.dataset.start = String(start);
  panel.dataset.end = String(end);
  wrap.appendChild(panel);
  editorsUi[index] = panel;
  input.focus();
  input.select();
}

function saveSegment(index) {
  const panel = editorsUi[index];
  const item = state[index];
  const editor = editors[index];
  if (!panel || !item?.active || !editor) return;
  const lineIndex = Number(panel.dataset.lineIndex);
  const start = Number(panel.dataset.start);
  const end = Number(panel.dataset.end);
  const bounds = lineBounds(item.lineStarts, item.textLength, lineIndex);
  const replacement = panel.querySelector('textarea')?.value || '';
  const absoluteStart = bounds.start + start;
  const absoluteEnd = bounds.start + end;
  const next = editor.value.slice(0, absoluteStart) + replacement + editor.value.slice(absoluteEnd);
  closeSegmentEditor(index, false);
  replacePayload(index, next, { source: 'segment-edit', dispatchInput: true }).catch(reportError);
}

function closeSegmentEditor(index) {
  editorsUi[index]?.remove();
  editorsUi[index] = null;
}

function publicState(index) {
  const item = state[index];
  return {
    paneIndex: index,
    active: !!item?.active,
    indexing: !!item?.indexing,
    chars: editors[index]?.value.length || 0,
    lineCount: item?.lineCount || 1,
    maxLineLength: item?.maxLineLength || 0,
    logicalScrollTop: Math.round(item?.logicalScrollTop || 0),
    logicalScrollLeft: Math.round(item?.logicalScrollLeft || 0),
    logicalHeight: Math.round(item?.logicalHeight || 0),
    logicalWidth: Math.round(item?.logicalWidth || 0),
    source: item?.source || '',
  };
}

function measureCharWidth(style) {
  const canvas = measureCharWidth.canvas || (measureCharWidth.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  if (!context) return (parseFloat(style.fontSize) || 13) * 0.62;
  context.font = `${style.fontWeight || '400'} ${style.fontSize || '13px'} ${style.fontFamily || 'monospace'}`;
  return context.measureText('M').width || (parseFloat(style.fontSize) || 13) * 0.62;
}

function reportError(error) {
  try { window.PayloadDiffDiagnostics?.log?.('error', 'large-payload.failed', { error }); } catch (_) {}
}

function installStyles() {
  if (document.querySelector('#large-payload-view-styles')) return;
  const style = document.createElement('style');
  style.id = 'large-payload-view-styles';
  style.textContent = `
    .editor-wrap.large-payload-active > .editor,
    .editor-wrap.large-payload-active > .editor-line-gutter,
    .editor-wrap.large-payload-active > .editor-indent-guides,
    .editor-wrap.large-payload-active > .code-fold-gutter,
    .editor-wrap.large-payload-active > .fold-code-view,
    .editor-wrap.large-payload-active > .editor-diff-overlay,
    .editor-wrap.large-payload-active > .inline-diff-layer,
    .editor-wrap.large-payload-active > .wrap-diff-layer,
    .editor-wrap.large-payload-active > .syntax-line-layer,
    .editor-wrap.large-payload-active > .syntax-error-rail,
    .editor-wrap.large-payload-active > .aligned-compare-view { display: none !important; }
    .large-payload-view {
      position: absolute;
      inset: 0;
      z-index: 12;
      overflow: auto;
      background: #0b1221;
      color: #dbe7f7;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 13px;
      contain: strict;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }
    .large-payload-view.hidden { display: none !important; }
    .large-payload-spacer { position: relative; min-width: 100%; min-height: 100%; pointer-events: none; }
    .large-payload-layer { position: absolute; inset: 0; pointer-events: none; }
    .large-payload-row {
      position: absolute;
      overflow: hidden;
      white-space: pre;
      box-sizing: border-box;
      pointer-events: auto;
      cursor: text;
    }
    .large-payload-row.diff-modified { background: rgba(245,158,11,.18); box-shadow: inset 4px 0 #fbbf24; }
    .large-payload-row.diff-added { background: rgba(34,197,94,.16); box-shadow: inset 4px 0 #4ade80; }
    .large-payload-row.diff-removed { background: rgba(239,68,68,.16); box-shadow: inset 4px 0 #f87171; }
    .large-payload-row.current { outline: 2px solid rgba(96,165,250,.9); outline-offset: -2px; }
    .large-payload-gutter {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      box-sizing: border-box;
      padding-right: 10px;
      text-align: right;
      color: #71809d;
      background: #0b1221;
      border-right: 1px solid #253149;
      user-select: none;
    }
    .large-payload-text { position: absolute; top: 0; white-space: pre; tab-size: 2; }
    .large-payload-badge {
      position: absolute;
      right: 30px;
      top: 8px;
      z-index: 20;
      padding: 3px 7px;
      border: 1px solid #34425e;
      border-radius: 999px;
      background: rgba(11,18,33,.9);
      color: #9eb1ce;
      font-size: 10px;
      pointer-events: none;
    }
    .large-payload-badge.hidden { display: none; }
    .large-payload-status-row { position: absolute; color: #9eb1ce; white-space: nowrap; }
    .large-payload-segment-editor {
      position: absolute;
      z-index: 30;
      inset: 8% 6%;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 8px;
      padding: 12px;
      border: 1px solid #425273;
      border-radius: 10px;
      background: #0b1221;
      box-shadow: 0 18px 60px rgba(0,0,0,.45);
    }
    .large-payload-segment-head { display: flex; justify-content: space-between; gap: 12px; color: #9eb1ce; font-size: 12px; }
    .large-payload-segment-editor textarea { width: 100%; height: 100%; resize: none; box-sizing: border-box; background: #080e1a; color: #e5edf9; border: 1px solid #34425e; border-radius: 6px; padding: 10px; font-family: inherit; }
    .large-payload-segment-actions { display: flex; justify-content: flex-end; gap: 8px; }
  `;
  document.head.appendChild(style);
}
