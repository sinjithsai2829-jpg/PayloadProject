const app = document.querySelector('#app');
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let seq = 0;
const pending = new Map();

worker.onmessage = ({ data }) => {
  const promise = pending.get(data.id);
  if (!promise) return;
  pending.delete(data.id);
  data.ok ? promise.resolve(data.result) : promise.reject(new Error(data.error));
};

function runWorker(task, payload) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, task, payload });
  });
}

const state = {
  mode: 'json',
  busy: false,
  compareIndex: -1,
  compare: null,
  diffExact: new Map(),
  diffAncestors: new Set(),
  panes: [createPaneState(), createPaneState()],
};

function createPaneState() {
  return {
    raw: '',
    formatted: '',
    parsed: null,
    view: 'code',
    filename: '',
    expanded: new Set(['$']),
    childLimits: new Map([['$', 250]]),
  };
}

app.innerHTML = `
  <header class="topbar">
    <div>
      <div class="brand-row">
        <h1>PayloadDiff</h1>
        <span class="privacy-pill">Local browser processing</span>
      </div>
      <p>Fast, ad-free JSON and XML formatting + comparison for large payloads.</p>
    </div>
    <div class="mode-switch" role="tablist" aria-label="Payload type">
      <button class="mode-btn active" data-mode="json">JSON</button>
      <button class="mode-btn" data-mode="xml">XML</button>
    </div>
  </header>

  <section class="toolbar card">
    <div class="toolbar-left">
      <button id="formatBtn" class="primary">Format both</button>
      <button id="compareBtn">Compare</button>
      <button id="clearBtn">Clear</button>
    </div>
    <div class="toolbar-right">
      <span id="statusText">Ready</span>
    </div>
  </section>

  <main class="workspace">
    ${paneTemplate(0, 'File 1')}
    ${paneTemplate(1, 'File 2')}
  </main>

  <section id="compareBar" class="compare-bar card hidden">
    <div id="compareSummary"></div>
    <div class="diff-nav">
      <button id="prevDiff">← Previous</button>
      <strong id="diffPosition">0 of 0</strong>
      <button id="nextDiff">Next →</button>
    </div>
  </section>

  <footer>
    Payload contents stay in this browser tab. Nothing is uploaded by this application.
  </footer>
`;

function paneTemplate(index, label) {
  return `
    <section class="pane card" data-pane="${index}">
      <div class="pane-head">
        <div>
          <h2>${label}</h2>
          <span class="file-meta" id="fileMeta${index}">Paste or upload a payload</span>
        </div>
        <div class="pane-actions">
          <label class="upload-btn">
            Upload
            <input class="file-input" data-pane="${index}" type="file" accept=".json,.xml,.txt,application/json,text/xml,application/xml,text/plain" />
          </label>
          <button class="copy-btn" data-pane="${index}">Copy</button>
        </div>
      </div>
      <div class="view-tabs" data-pane="${index}">
        <button class="view-btn active" data-view="code">Code</button>
        <button class="view-btn tree-tab" data-view="tree">Tree</button>
      </div>
      <div class="editor-wrap">
        <textarea id="editor${index}" class="editor" spellcheck="false" wrap="off" placeholder="Paste raw JSON here..."></textarea>
        <div id="tree${index}" class="tree-view hidden"></div>
      </div>
    </section>
  `;
}

const els = {
  status: document.querySelector('#statusText'),
  format: document.querySelector('#formatBtn'),
  compare: document.querySelector('#compareBtn'),
  clear: document.querySelector('#clearBtn'),
  compareBar: document.querySelector('#compareBar'),
  compareSummary: document.querySelector('#compareSummary'),
  diffPosition: document.querySelector('#diffPosition'),
  prevDiff: document.querySelector('#prevDiff'),
  nextDiff: document.querySelector('#nextDiff'),
  editors: [document.querySelector('#editor0'), document.querySelector('#editor1')],
  trees: [document.querySelector('#tree0'), document.querySelector('#tree1')],
  fileMeta: [document.querySelector('#fileMeta0'), document.querySelector('#fileMeta1')],
};

for (const btn of document.querySelectorAll('.mode-btn')) {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
}
for (const input of document.querySelectorAll('.file-input')) {
  input.addEventListener('change', onUpload);
}
for (const btn of document.querySelectorAll('.copy-btn')) {
  btn.addEventListener('click', () => copyPane(Number(btn.dataset.pane)));
}
for (const tabs of document.querySelectorAll('.view-tabs')) {
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    switchView(Number(tabs.dataset.pane), btn.dataset.view);
  });
}

els.format.addEventListener('click', formatBoth);
els.compare.addEventListener('click', compareBoth);
els.clear.addEventListener('click', clearAll);
els.prevDiff.addEventListener('click', () => moveDiff(-1));
els.nextDiff.addEventListener('click', () => moveDiff(1));
els.editors.forEach((editor, index) => {
  editor.addEventListener('input', () => {
    state.panes[index].raw = editor.value;
    state.panes[index].formatted = '';
    state.panes[index].parsed = null;

    // Editing valid/temporarily-invalid JSON or XML is part of the same live
    // comparison session. The live comparison module owns refresh while that
    // session is active, so the core must not destroy the compare UI first.
    if (!isLiveComparisonActive()) clearComparison();
    updateMeta(index);
  });
});

// Code view and Tree view intentionally consume different JSON diff models.
// Code uses formatted-line alignment (what a user sees in a normal text diff),
// while Tree keeps JSON-path structural differences for semantic highlighting.
window.addEventListener('payloaddiff:live-compare-updated', (event) => {
  if (state.mode !== 'json') return;
  const detail = event.detail;
  if (!detail?.summary || !Array.isArray(detail.diffs)) return;

  state.compare = {
    mode: 'json',
    diffs: detail.diffs,
    structuralDiffs: Array.isArray(detail.structuralDiffs) ? detail.structuralDiffs : [],
    summary: detail.summary,
    identical: !!detail.identical,
    elapsedMs: detail.elapsedMs || 0,
  };
  const total = detail.diffs.length;
  const requestedIndex = Number.isInteger(detail.currentDiffIndex) ? detail.currentDiffIndex : state.compareIndex;
  state.compareIndex = total ? Math.min(Math.max(0, requestedIndex || 0), total - 1) : -1;
  buildDiffIndex();

  for (let index = 0; index < state.panes.length; index += 1) {
    if (state.panes[index].view === 'tree' && state.panes[index].parsed != null) renderTree(index);
  }
});

function isLiveComparisonActive() {
  return !!window.PayloadDiffCompareSession?.isActive?.()
    && window.PayloadDiffCompareSession?.getMode?.() === state.mode;
}

function switchMode(mode) {
  if (mode === state.mode) return;
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
  document.querySelectorAll('.tree-tab').forEach((btn) => btn.classList.toggle('hidden', mode !== 'json'));
  els.editors.forEach((editor) => {
    editor.placeholder = mode === 'json' ? 'Paste raw JSON here...' : 'Paste raw XML here...';
  });
  if (mode === 'xml') {
    state.panes.forEach((_, index) => switchView(index, 'code'));
  }
  clearComparison();
  setStatus(`${mode.toUpperCase()} mode`);
}

async function onUpload(event) {
  const index = Number(event.target.dataset.pane);
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const pane = state.panes[index];
  pane.raw = text;
  pane.formatted = '';
  pane.parsed = null;
  pane.filename = file.name;
  els.editors[index].value = text;
  updateMeta(index);
  clearComparison();
  window.dispatchEvent(new CustomEvent('payloaddiff:comparison-reset'));
}

async function formatBoth() {
  if (state.busy) return;
  const targets = [0, 1].filter((i) => els.editors[i].value.trim());
  if (!targets.length) return setStatus('Paste or upload a payload first.', true);

  setBusy(true, 'Formatting large payloads…');
  try {
    for (const index of targets) {
      await formatPane(index, detectedPaneMode(index));
    }
    setStatus('Formatting complete.');
    refreshScrollChrome();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function formatPane(index, mode = state.mode) {
  const text = els.editors[index].value;
  const result = await runWorker('format', { mode, text, paneIndex: index });
  const pane = state.panes[index];
  pane.raw = result.formatted;
  pane.formatted = result.formatted;
  pane.parsed = mode === 'json' ? (result.parsed ?? null) : null;
  els.editors[index].value = result.formatted;
  updateMeta(index, result);
  if (mode === 'json' && pane.view === 'tree') renderTree(index);
  if (mode !== 'json' && pane.view === 'tree') switchView(index, 'code');
  if (result.repaired && result.repairNote) setStatus(result.repairNote);
  refreshScrollChrome(index);
}

function detectedPaneMode(index) {
  const text = els.editors[index]?.value || '';
  if (!text.trim()) return state.mode;
  try {
    const detected = window.PayloadDiffAutoDetect?.detect?.(text, { paneIndex: index });
    if (detected?.mode && detected.confidence >= 0.8) return detected.mode;
  } catch (_) {}
  return state.mode;
}

function refreshScrollChrome(index = null) {
  window.dispatchEvent(new CustomEvent('payloaddiff:content-layout-changed', {
    detail: { paneIndex: index },
  }));
  const refresh = () => {
    window.PayloadDiffScrollbars?.refresh?.(index);
    window.PayloadDiffHorizontalScrollbars?.refresh?.(index);
  };
  requestAnimationFrame(() => {
    refresh();
    requestAnimationFrame(refresh);
  });
}

async function compareBoth() {
  if (state.busy) return;
  const left = els.editors[0].value;
  const right = els.editors[1].value;
  if (!left.trim() || !right.trim()) return setStatus('Both File 1 and File 2 are required.', true);

  const session = window.PayloadDiffCompareSession;
  if (!session?.start) return setStatus('Comparison engine is still loading. Try Compare again.', true);

  setBusy(true, 'Comparing in background worker…');
  try {
    await session.start();
  } catch (error) {
    setStatus(error?.message || 'Comparison failed.', true);
  } finally {
    setBusy(false);
  }
}

function renderComparison() {
  const c = state.compare;
  if (!c) return clearComparison();
  els.compareBar.classList.remove('hidden');
  const s = c.summary;
  els.compareSummary.innerHTML = c.identical
    ? `<strong class="same">No differences found.</strong>`
    : `<strong>${s.added + s.removed + s.modified} changes</strong> <span class="added">+${s.added} added</span> <span class="removed">−${s.removed} removed</span> <span class="modified">~${s.modified} modified</span>${s.truncated ? ' <span class="warn">(navigation capped for performance)</span>' : ''}`;

  const total = getNavigableDiffCount();
  els.diffPosition.textContent = total ? `${state.compareIndex + 1} of ${total}` : '0 of 0';
  els.prevDiff.disabled = !total;
  els.nextDiff.disabled = !total;
}

function getNavigableDiffCount() {
  if (!state.compare) return 0;
  if (state.mode === 'json') return state.compare.diffs.length;
  return Math.max(state.compare.leftChanged.length, state.compare.rightChanged.length);
}

function moveDiff(delta) {
  const total = getNavigableDiffCount();
  if (!total) return;
  state.compareIndex = (state.compareIndex + delta + total) % total;
  renderComparison();

  if (state.mode === 'json') {
    const diff = state.compare.diffs[state.compareIndex];
    if (diff?.path?.startsWith('$jsonline')) {
      if (diff.leftLine) scrollTextareaToLine(els.editors[0], diff.leftLine);
      if (diff.rightLine) scrollTextareaToLine(els.editors[1], diff.rightLine);
    } else if (diff?.path) {
      revealJsonPath(diff.path);
    }
  } else {
    const leftLine = state.compare.leftChanged[state.compareIndex];
    const rightLine = state.compare.rightChanged[state.compareIndex];
    if (leftLine) scrollTextareaToLine(els.editors[0], leftLine);
    if (rightLine) scrollTextareaToLine(els.editors[1], rightLine);
  }
}

function revealJsonPath(path) {
  [0, 1].forEach((index) => {
    const pane = state.panes[index];
    for (const ancestor of pathAncestors(path)) pane.expanded.add(ancestor);
    ensurePathWithinTreeLimit(index, path);
    if (pane.view !== 'tree') switchView(index, 'tree');
    else renderTree(index);
  });

  requestAnimationFrame(() => {
    [0, 1].forEach((index) => {
      const node = els.trees[index].querySelector(`[data-path="${cssEscape(path)}"]`);
      if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });
}

function ensurePathWithinTreeLimit(index, path) {
  const pane = state.panes[index];
  if (pane.parsed == null || path === '$') return;
  const tokens = parsePathTokens(path);
  let value = pane.parsed;
  let currentPath = '$';

  for (const token of tokens) {
    if (value == null) return;
    if (Array.isArray(value)) {
      const childIndex = Number(token);
      if (!Number.isInteger(childIndex)) return;
      pane.childLimits.set(currentPath, Math.max(pane.childLimits.get(currentPath) || 250, childIndex + 1));
      value = value[childIndex];
      currentPath += `[${childIndex}]`;
    } else if (typeof value === 'object') {
      const keys = Object.keys(value);
      const childIndex = keys.indexOf(token);
      if (childIndex < 0) return;
      pane.childLimits.set(currentPath, Math.max(pane.childLimits.get(currentPath) || 250, childIndex + 1));
      value = value[token];
      currentPath = joinPath(currentPath, token);
    } else return;
  }
}

function scrollTextareaToLine(textarea, line) {
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  textarea.scrollTop = Math.max(0, (line - 5) * lineHeight);
}

async function switchView(index, view) {
  const pane = state.panes[index];
  if (view === 'tree' && state.mode !== 'json') return;

  if (view === 'tree' && pane.parsed == null) {
    const text = els.editors[index].value;
    if (!text.trim()) return setStatus(`File ${index + 1} is empty.`, true);
    try {
      setStatus(`Building File ${index + 1} tree…`);
      const result = await runWorker('format', { mode: 'json', text });
      pane.parsed = result.parsed ?? null;
      pane.formatted = result.formatted;
      updateMeta(index, result);
    } catch (error) {
      setStatus(`Tree view unavailable: ${error.message}`, true);
      return;
    }
  }

  pane.view = view;
  const wrapper = document.querySelector(`.view-tabs[data-pane="${index}"]`);
  wrapper.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  els.editors[index].classList.toggle('hidden', view !== 'code');
  els.trees[index].classList.toggle('hidden', view !== 'tree');
  if (view === 'tree') renderTree(index);
}

function renderTree(index) {
  const root = els.trees[index];
  const pane = state.panes[index];
  root.replaceChildren();
  if (pane.parsed == null) {
    root.textContent = 'Format JSON to build the tree.';
    return;
  }
  const frag = document.createDocumentFragment();
  appendTreeNode(frag, '$', pane.parsed, '$', 0, index);
  root.appendChild(frag);
}

function appendTreeNode(parent, key, value, path, depth, paneIndex) {
  const type = nodeType(value);
  const expandable = type === 'object' || type === 'array';
  const expanded = state.panes[paneIndex].expanded.has(path);
  const row = document.createElement('div');
  row.className = `tree-row ${diffClassForPath(path, paneIndex)}`;
  row.style.setProperty('--depth', depth);
  row.dataset.path = path;

  const toggle = document.createElement('button');
  toggle.className = 'tree-toggle';
  toggle.textContent = expandable ? (expanded ? '▾' : '▸') : '';
  toggle.disabled = !expandable;

  const keyEl = document.createElement('span');
  keyEl.className = 'tree-key';
  keyEl.textContent = key;

  const valueEl = document.createElement('span');
  valueEl.className = `tree-value ${type}`;
  valueEl.textContent = expandable ? containerLabel(value) : previewValue(value);

  row.append(toggle, keyEl, valueEl);
  parent.appendChild(row);

  if (expandable) {
    toggle.addEventListener('click', () => {
      const expandedSet = state.panes[paneIndex].expanded;
      expandedSet.has(path) ? expandedSet.delete(path) : expandedSet.add(path);
      renderTree(paneIndex);
      requestAnimationFrame(() => {
        els.trees[paneIndex].querySelector(`[data-path="${cssEscape(path)}"]`)?.scrollIntoView({ block: 'nearest' });
      });
    });
  }

  if (!expandable || !expanded) return;

  const pane = state.panes[paneIndex];
  const total = Array.isArray(value) ? value.length : Object.keys(value).length;
  const limit = Math.min(pane.childLimits.get(path) || 250, total);

  if (Array.isArray(value)) {
    for (let i = 0; i < limit; i += 1) {
      appendTreeNode(parent, `[${i}]`, value[i], `${path}[${i}]`, depth + 1, paneIndex);
    }
  } else {
    const keys = Object.keys(value);
    for (let i = 0; i < limit; i += 1) {
      const childKey = keys[i];
      appendTreeNode(parent, childKey, value[childKey], joinPath(path, childKey), depth + 1, paneIndex);
    }
  }

  if (limit < total) appendLoadMoreRow(parent, path, depth + 1, paneIndex, limit, total);
}

function appendLoadMoreRow(parent, path, depth, paneIndex, shown, total) {
  const row = document.createElement('div');
  row.className = 'tree-row tree-more-row';
  row.style.setProperty('--depth', depth);
  const button = document.createElement('button');
  button.className = 'tree-more';
  const remaining = total - shown;
  button.textContent = `Show ${Math.min(250, remaining).toLocaleString()} more (${remaining.toLocaleString()} remaining)`;
  button.addEventListener('click', () => {
    state.panes[paneIndex].childLimits.set(path, Math.min(total, shown + 250));
    renderTree(paneIndex);
  });
  row.appendChild(button);
  parent.appendChild(row);
}

function buildDiffIndex() {
  state.diffExact = new Map();
  state.diffAncestors = new Set();
  if (!state.compare || state.mode !== 'json') return;
  const treeDiffs = Array.isArray(state.compare.structuralDiffs) && state.compare.structuralDiffs.length
    ? state.compare.structuralDiffs
    : state.compare.diffs.filter((diff) => diff?.path && !diff.path.startsWith('$jsonline'));
  for (const diff of treeDiffs) {
    state.diffExact.set(diff.path, diff.type);
    const ancestors = pathAncestors(diff.path);
    for (let i = 0; i < ancestors.length - 1; i += 1) state.diffAncestors.add(ancestors[i]);
  }
}

function diffClassForPath(path, paneIndex) {
  if (!state.compare || state.mode !== 'json') return '';
  const exactType = state.diffExact.get(path);
  if (exactType) {
    if (exactType === 'added') return paneIndex === 1 ? 'diff-added' : 'diff-branch';
    if (exactType === 'removed') return paneIndex === 0 ? 'diff-removed' : 'diff-branch';
    return 'diff-modified';
  }
  return state.diffAncestors.has(path) ? 'diff-branch' : '';
}

function pathAncestors(path) {
  const out = ['$'];
  if (path === '$') return out;
  let current = '$';
  const rest = path.slice(1);
  const tokens = rest.match(/\.[A-Za-z_$][\w$]*|\[(?:\d+|"(?:\\.|[^"])*")\]/g) || [];
  for (const token of tokens) {
    current += token;
    out.push(current);
  }
  return out;
}

function parsePathTokens(path) {
  const raw = path.slice(1).match(/\.[A-Za-z_$][\w$]*|\[(?:\d+|"(?:\\.|[^"])*")\]/g) || [];
  return raw.map((token) => {
    if (token.startsWith('.')) return token.slice(1);
    const inner = token.slice(1, -1);
    if (/^\d+$/.test(inner)) return Number(inner);
    try { return JSON.parse(inner); } catch { return inner; }
  });
}

function joinPath(path, key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function nodeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' ? 'object' : typeof value;
}

function containerLabel(value) {
  return Array.isArray(value) ? `Array(${value.length})` : `Object(${Object.keys(value).length})`;
}

function previewValue(value) {
  if (typeof value === 'string') return JSON.stringify(value.length > 180 ? `${value.slice(0, 180)}…` : value);
  return String(value);
}

async function copyPane(index) {
  const text = els.editors[index].value;
  if (!text) return setStatus('Nothing to copy.', true);
  await navigator.clipboard.writeText(text);
  setStatus(`File ${index + 1} copied.`);
}

function clearAll() {
  state.panes = [createPaneState(), createPaneState()];
  els.editors.forEach((editor) => editor.value = '');
  els.trees.forEach((tree) => tree.replaceChildren());
  els.fileMeta.forEach((meta) => meta.textContent = 'Paste or upload a payload');
  clearComparison();
  window.dispatchEvent(new CustomEvent('payloaddiff:comparison-reset'));
  setStatus('Cleared.');
}

function clearComparison() {
  state.compare = null;
  state.compareIndex = -1;
  state.diffExact = new Map();
  state.diffAncestors = new Set();
  els.compareBar.classList.add('hidden');
  els.compareSummary.innerHTML = '';
  els.diffPosition.textContent = '0 of 0';
  els.prevDiff.disabled = true;
  els.nextDiff.disabled = true;
}

function updateMeta(index, result) {
  const pane = state.panes[index];
  const text = els.editors[index].value;
  if (!text) {
    els.fileMeta[index].textContent = 'Paste or upload a payload';
    return;
  }
  const bytes = new Blob([text]).size;
  const size = formatBytes(bytes);
  if (result) {
    els.fileMeta[index].textContent = `${pane.filename || 'Pasted payload'} • ${result.lineCount.toLocaleString()} lines • ${size} • ${result.elapsedMs} ms`;
  } else {
    els.fileMeta[index].textContent = `${pane.filename || 'Pasted payload'} • ${size}`;
  }
}

function setBusy(busy, message = '') {
  state.busy = busy;
  [els.format, els.compare, els.clear].forEach((button) => button.disabled = busy);
  document.body.classList.toggle('busy', busy);
  if (message) setStatus(message);
  if (!busy) refreshScrollChrome();
}

function setStatus(message, error = false) {
  els.status.textContent = message;
  els.status.classList.toggle('error', error);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

// Keep tree hidden for XML on first load only when mode changes later.
document.querySelectorAll('.tree-tab').forEach((btn) => btn.classList.remove('hidden'));
