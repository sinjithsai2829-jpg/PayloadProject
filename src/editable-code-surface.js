const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];

const gutters = [];
const gutterRows = [];
const guideLayers = [];
const renderFrames = [0, 0];
const cacheTimers = [0, 0];
const activeLines = [1, 1];
const lineCaches = editors.map((editor) => buildLineCache(editor?.value || ''));

installStyles();
for (let index = 0; index < editors.length; index += 1) installPane(index);
installProgrammaticRefreshHooks();

function installPane(index) {
  const pane = panes[index];
  const editor = editors[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!pane || !editor || !wrap) return;

  editor.classList.add('editor-with-line-numbers');

  const guideLayer = document.createElement('div');
  guideLayer.className = 'editor-indent-guides';
  guideLayer.setAttribute('aria-hidden', 'true');
  wrap.appendChild(guideLayer);
  guideLayers[index] = guideLayer;

  const gutter = document.createElement('div');
  gutter.className = 'editor-line-gutter';
  gutter.setAttribute('aria-hidden', 'true');
  const rows = document.createElement('div');
  rows.className = 'editor-line-gutter-rows';
  gutter.appendChild(rows);
  wrap.appendChild(gutter);
  gutters[index] = gutter;
  gutterRows[index] = rows;

  const refreshSurface = () => {
    const treeActive = pane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
    if (!treeActive) editor.classList.remove('hidden');
    const hidden = !!treeActive || editor.classList.contains('hidden');
    gutter.classList.toggle('hidden', hidden);
    guideLayer.classList.toggle('hidden', hidden);
    scheduleRender(index);
  };

  editor.addEventListener('scroll', () => scheduleRender(index), { passive: true });
  editor.addEventListener('input', () => scheduleCacheRefresh(index));
  editor.addEventListener('click', () => updateActiveLine(index));
  editor.addEventListener('keyup', () => updateActiveLine(index));
  pane.querySelector('.view-tabs')?.addEventListener('click', () => requestAnimationFrame(refreshSurface));

  if (typeof ResizeObserver !== 'undefined') {
    const resize = new ResizeObserver(() => scheduleRender(index));
    resize.observe(editor);
  } else {
    window.addEventListener('resize', () => scheduleRender(index), { passive: true });
  }

  refreshSurface();
}

function installProgrammaticRefreshHooks() {
  for (const button of [document.querySelector('#formatBtn'), document.querySelector('#compareBtn')].filter(Boolean)) {
    button.addEventListener('click', () => refreshAfterBusy(), true);
  }

  document.querySelector('#clearBtn')?.addEventListener('click', () => {
    requestAnimationFrame(() => refreshAllCaches(true));
  }, true);

  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => requestAnimationFrame(() => refreshAllCaches(true)), true);
  });

  document.querySelectorAll('.file-input').forEach((input) => {
    input.addEventListener('change', () => setTimeout(() => refreshAllCaches(true), 0));
  });

  window.addEventListener('payloaddiff:live-compare-updated', () => refreshAllCaches(false));
  window.addEventListener('payloaddiff:comparison-reset', () => refreshAllCaches(true));
  window.addEventListener('payloaddiff:word-wrap-changed', () => refreshAllCaches(false));
  window.addEventListener('payloaddiff:word-wrap-layout', (event) => {
    const index = Number(event.detail?.paneIndex);
    if (Number.isInteger(index)) scheduleRender(index);
    else editors.forEach((_, paneIndex) => scheduleRender(paneIndex));
  });
}

function refreshAfterBusy() {
  let sawBusy = document.body.classList.contains('busy');
  const started = performance.now();
  const check = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if ((sawBusy && !document.body.classList.contains('busy')) || performance.now() - started > 30000) {
      refreshAllCaches(true);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function scheduleCacheRefresh(index) {
  clearTimeout(cacheTimers[index]);
  cacheTimers[index] = window.setTimeout(() => {
    refreshCache(index, true);
    updateActiveLine(index);
  }, 90);
}

function refreshAllCaches(force) {
  for (let index = 0; index < editors.length; index += 1) refreshCache(index, force);
}

function refreshCache(index, force) {
  const editor = editors[index];
  if (!editor) return;
  const cache = lineCaches[index];
  const lengthChanged = cache.length !== editor.value.length;
  if (force || lengthChanged) lineCaches[index] = buildLineCache(editor.value);
  window.PayloadDiffWordWrap?.refresh?.(index);
  scheduleRender(index);
}

function updateActiveLine(index) {
  const editor = editors[index];
  const cache = lineCaches[index];
  if (!editor || !cache) return;
  activeLines[index] = lineForOffset(cache.lineStarts, editor.selectionStart || 0);
  scheduleRender(index);
}

function scheduleRender(index) {
  if (renderFrames[index]) return;
  renderFrames[index] = requestAnimationFrame(() => {
    renderFrames[index] = 0;
    renderLineNumbers(index);
    renderIndentGuides(index);
  });
}

function renderLineNumbers(index) {
  const editor = editors[index];
  const gutter = gutters[index];
  const rows = gutterRows[index];
  if (!editor || !gutter || !rows || gutter.classList.contains('hidden')) return;

  const metrics = visibleMetrics(index, editor, lineCaches[index].lines.length);
  const fragment = document.createDocumentFragment();
  for (let line = metrics.first; line <= metrics.last; line += 1) {
    const lineMetrics = logicalLineMetrics(index, line, metrics);
    const row = document.createElement('div');
    row.className = 'editor-line-number';
    row.textContent = line.toLocaleString();
    row.style.top = `${lineMetrics.top - editor.scrollTop}px`;
    row.style.height = `${lineMetrics.height}px`;
    row.style.lineHeight = `${metrics.lineHeight}px`;
    fragment.appendChild(row);
  }
  rows.replaceChildren(fragment);
}

function renderIndentGuides(index) {
  const editor = editors[index];
  const layer = guideLayers[index];
  const cache = lineCaches[index];
  if (!editor || !layer || !cache || layer.classList.contains('hidden')) return;

  const metrics = visibleMetrics(index, editor, cache.lines.length);
  const charWidth = measureCharWidth(metrics.style);
  const indentUnit = Math.max(1, cache.indentUnit || 2);
  const fragment = document.createDocumentFragment();
  const contentOrigin = 14;

  for (let line = metrics.first; line <= metrics.last; line += 1) {
    const text = cache.lines[line - 1] || '';
    const columns = leadingIndentColumns(text, metrics.tabSize);
    if (!columns) continue;

    const depth = Math.floor(columns / indentUnit);
    if (!depth) continue;

    const lineMetrics = logicalLineMetrics(index, line, metrics);
    const top = lineMetrics.top - editor.scrollTop;
    const guideHeight = lineMetrics.height;
    for (let level = 1; level <= depth; level += 1) {
      const guide = document.createElement('span');
      const isActive = line === activeLines[index] && level === depth;
      guide.className = `editor-indent-guide${isActive ? ' active' : ''}`;
      guide.style.left = `${contentOrigin + level * indentUnit * charWidth - editor.scrollLeft}px`;
      guide.style.top = `${top}px`;
      guide.style.height = `${guideHeight}px`;
      fragment.appendChild(guide);
    }
  }

  layer.replaceChildren(fragment);
}

function visibleMetrics(index, editor, totalLines) {
  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const tabSize = Math.max(1, parseInt(style.tabSize, 10) || 2);
  const wrapped = !!window.PayloadDiffWordWrap?.isEnabled?.(index);
  if (wrapped) {
    const range = window.PayloadDiffWordWrap?.getVisibleLineRange?.(index, 6) || { first: 1, last: totalLines };
    return { style, lineHeight, paddingTop, tabSize, first: range.first, last: range.last, wrapped };
  }

  const overscan = 8;
  const first = Math.max(1, Math.floor((editor.scrollTop - paddingTop) / lineHeight) + 1 - overscan);
  const visibleCount = Math.ceil(editor.clientHeight / lineHeight) + overscan * 2 + 2;
  const last = Math.min(Math.max(1, totalLines), first + visibleCount);
  return { style, lineHeight, paddingTop, tabSize, first, last, wrapped };
}

function logicalLineMetrics(index, line, metrics) {
  if (metrics.wrapped) {
    const wrapped = window.PayloadDiffWordWrap?.getLineMetrics?.(index, line);
    if (wrapped) return wrapped;
  }
  return {
    top: metrics.paddingTop + (line - 1) * metrics.lineHeight,
    height: metrics.lineHeight,
  };
}

function buildLineCache(text) {
  const value = String(text || '');
  const lines = value.split('\n');
  const lineStarts = new Array(lines.length);
  lineStarts[0] = 0;
  let offset = 0;
  for (let index = 1; index < lines.length; index += 1) {
    offset += lines[index - 1].length + 1;
    lineStarts[index] = offset;
  }
  return {
    length: value.length,
    lines,
    lineStarts,
    indentUnit: inferIndentUnit(lines),
  };
}

function inferIndentUnit(lines) {
  let minimum = Infinity;
  const limit = Math.min(lines.length, 4000);
  for (let index = 0; index < limit; index += 1) {
    const line = lines[index];
    if (!line || !line.trim()) continue;
    const columns = leadingIndentColumns(line, 2);
    if (columns > 0 && columns < minimum) minimum = columns;
    if (minimum === 1) break;
  }
  if (!Number.isFinite(minimum)) return 2;
  return Math.max(1, Math.min(8, minimum));
}

function leadingIndentColumns(text, tabSize) {
  let columns = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === ' ') columns += 1;
    else if (char === '\t') columns += tabSize;
    else break;
  }
  return columns;
}

function lineForOffset(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(1, hi + 1);
}

function measureCharWidth(style) {
  const canvas = measureCharWidth.canvas || (measureCharWidth.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  if (!context) return (parseFloat(style.fontSize) || 13) * 0.61;
  context.font = `${style.fontWeight || '400'} ${style.fontSize || '13px'} ${style.fontFamily || 'monospace'}`;
  return context.measureText(' ').width || (parseFloat(style.fontSize) || 13) * 0.61;
}

function installStyles() {
  if (document.querySelector('#editable-code-surface-styles')) return;
  const style = document.createElement('style');
  style.id = 'editable-code-surface-styles';
  style.textContent = `
    .editor.editor-with-line-numbers { padding-left: 78px; }
    .editor-indent-guides {
      position: absolute;
      z-index: 4;
      inset: 0 14px 0 64px;
      overflow: hidden;
      pointer-events: none;
    }
    .editor-indent-guide {
      position: absolute;
      width: 1px;
      background: rgba(112, 133, 171, .24);
      box-shadow: 0 0 0 1px rgba(15, 23, 42, .10);
    }
    .editor-indent-guide.active {
      width: 2px;
      background: rgba(96, 165, 250, .62);
    }
    .editor-line-gutter {
      position: absolute;
      z-index: 5;
      left: 4px;
      top: 0;
      bottom: 0;
      width: 64px;
      overflow: hidden;
      pointer-events: none;
      background: #0b1221;
      border-right: 1px solid #253149;
      user-select: none;
    }
    .editor-line-gutter-rows { position: absolute; inset: 0; }
    .editor-line-number {
      position: absolute;
      left: 0;
      right: 0;
      padding-right: 10px;
      text-align: right;
      color: #71809d;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 12px;
      white-space: nowrap;
    }
    .editor-wrap:focus-within .editor-line-gutter { border-right-color: #3b4c70; }
    .editor-wrap:focus-within .editor-indent-guide { background: rgba(112, 133, 171, .34); }
    .editor-wrap:focus-within .editor-indent-guide.active { background: rgba(96, 165, 250, .72); }
  `;
  document.head.appendChild(style);
}
