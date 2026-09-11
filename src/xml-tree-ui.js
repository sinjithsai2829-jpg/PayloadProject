const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const trees = [document.querySelector('#tree0'), document.querySelector('#tree1')];
const statusText = document.querySelector('#statusText');

const state = [0, 1].map(() => ({
  model: null,
  sourceText: '',
  expanded: new Set(['$']),
  childLimits: new Map([['$', 250]]),
  diffLines: [],
}));

let seq = 0;
const pending = new Map();
const worker = new Worker(new URL('./xml-tree-worker.js', import.meta.url), { type: 'module' });

worker.onmessage = ({ data }) => {
  const request = pending.get(data.id);
  if (!request) return;
  pending.delete(data.id);
  data.ok ? request.resolve(data.result) : request.reject(new Error(data.error));
};

function runWorker(task, payload) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, task, ...payload });
  });
}

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode || 'json';
}

function isXmlMode() {
  return currentMode() === 'xml';
}

for (const button of document.querySelectorAll('.mode-btn')) {
  button.addEventListener('click', () => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.tree-tab').forEach((tab) => tab.classList.remove('hidden'));
      if (button.dataset.mode !== 'xml') return;
      panes.forEach((pane, index) => {
        const active = pane.querySelector('.view-btn.active')?.dataset.view || 'code';
        if (active === 'tree') showXmlTree(index);
      });
    });
  });
}

for (let index = 0; index < panes.length; index += 1) {
  panes[index]?.querySelector('.view-tabs')?.addEventListener('click', (event) => {
    if (!isXmlMode()) return;
    const button = event.target.closest('.view-btn');
    if (!button) return;

    // main.js still owns JSON Tree. In XML mode this module renders the same
    // Tree surface, but the event is allowed to continue so sync-scroll.js can
    // mirror Code/Tree changes to the other pane.
    event.preventDefault();
    if (button.dataset.view === 'tree') showXmlTree(index);
    else showCode(index);
  }, true);

  editors[index]?.addEventListener('input', () => {
    state[index].model = null;
    state[index].sourceText = '';
    worker.postMessage({ id: ++seq, task: 'clear', paneIndex: index });
    if (isXmlMode() && panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active')) {
      showCode(index);
    }
  });
}

window.addEventListener('payloaddiff:live-compare-updated', (event) => {
  if (event.detail?.mode !== 'xml' || !Array.isArray(event.detail.diffs)) return;
  state[0].diffLines = buildDiffLines(event.detail.diffs, 0);
  state[1].diffLines = buildDiffLines(event.detail.diffs, 1);
  for (let index = 0; index < 2; index += 1) {
    if (isXmlMode() && panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active')) {
      renderXmlTree(index);
    }
  }
});

window.addEventListener('payloaddiff:comparison-reset', () => {
  state.forEach((paneState) => { paneState.diffLines = []; });
});

async function showXmlTree(index) {
  const text = editors[index]?.value || '';
  if (!text.trim()) {
    setStatus(`File ${index + 1} is empty.`, true);
    return;
  }

  try {
    if (!state[index].model || state[index].sourceText !== text) {
      setStatus(`Building File ${index + 1} XML tree…`);
      const result = await runWorker('build', { paneIndex: index, text });
      state[index].model = result.model;
      state[index].sourceText = text;
      state[index].expanded = new Set(['$']);
      state[index].childLimits = new Map([['$', 250]]);
    }

    activateView(index, 'tree');
    renderXmlTree(index);
    setStatus('XML Tree view ready.');
  } catch (error) {
    setStatus(`Tree view unavailable: ${error.message}`, true);
    activateView(index, 'code');
  }
}

function showCode(index) {
  activateView(index, 'code');
}

function activateView(index, view) {
  const tabs = panes[index]?.querySelector('.view-tabs');
  tabs?.querySelectorAll('.view-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  editors[index]?.classList.toggle('hidden', view !== 'code');
  trees[index]?.classList.toggle('hidden', view !== 'tree');
}

function renderXmlTree(index) {
  const root = trees[index];
  const model = state[index].model;
  if (!root) return;
  root.replaceChildren();
  if (!model) {
    root.textContent = 'Format XML to build the tree.';
    return;
  }

  const fragment = document.createDocumentFragment();
  appendNode(fragment, model, '#document', '$', 0, index);
  root.appendChild(fragment);
}

function appendNode(parent, node, label, path, depth, paneIndex) {
  const expandable = Array.isArray(node.children) && node.children.length > 0;
  const expanded = state[paneIndex].expanded.has(path);
  const row = document.createElement('div');
  row.className = `tree-row ${xmlDiffClass(node, paneIndex)}`;
  row.style.setProperty('--depth', depth);
  row.dataset.path = path;

  const toggle = document.createElement('button');
  toggle.className = 'tree-toggle';
  toggle.textContent = expandable ? (expanded ? '▾' : '▸') : '';
  toggle.disabled = !expandable;

  const key = document.createElement('span');
  key.className = 'tree-key';
  key.textContent = label;

  const value = document.createElement('span');
  value.className = `tree-value ${node.kind === 'text' ? 'string' : 'object'}`;
  value.textContent = nodeSummary(node);

  row.append(toggle, key, value);
  parent.appendChild(row);

  if (node.kind === 'element' && node.attributes?.length) {
    for (const attribute of node.attributes) {
      const attributeRow = document.createElement('div');
      attributeRow.className = `tree-row ${xmlDiffClass({ lineStart: node.lineStart, lineEnd: node.lineStart }, paneIndex)}`;
      attributeRow.style.setProperty('--depth', depth + 1);
      attributeRow.dataset.path = attribute.path;

      const spacer = document.createElement('button');
      spacer.className = 'tree-toggle';
      spacer.disabled = true;

      const attributeKey = document.createElement('span');
      attributeKey.className = 'tree-key';
      attributeKey.textContent = `@${attribute.name}`;

      const attributeValue = document.createElement('span');
      attributeValue.className = 'tree-value string';
      attributeValue.textContent = JSON.stringify(attribute.value);
      attributeRow.append(spacer, attributeKey, attributeValue);
      parent.appendChild(attributeRow);
    }
  }

  if (expandable) {
    toggle.addEventListener('click', () => {
      const expandedSet = state[paneIndex].expanded;
      expandedSet.has(path) ? expandedSet.delete(path) : expandedSet.add(path);
      renderXmlTree(paneIndex);
    });
  }

  if (!expandable || !expanded) return;

  const total = node.children.length;
  const limit = Math.min(state[paneIndex].childLimits.get(path) || 250, total);
  for (let childIndex = 0; childIndex < limit; childIndex += 1) {
    const child = node.children[childIndex];
    appendNode(parent, child, childLabel(child), child.path, depth + 1, paneIndex);
  }

  if (limit < total) appendLoadMore(parent, path, depth + 1, paneIndex, limit, total);
}

function appendLoadMore(parent, path, depth, paneIndex, shown, total) {
  const row = document.createElement('div');
  row.className = 'tree-row tree-more-row';
  row.style.setProperty('--depth', depth);
  const button = document.createElement('button');
  button.className = 'tree-more';
  const remaining = total - shown;
  button.textContent = `Show ${Math.min(250, remaining).toLocaleString()} more (${remaining.toLocaleString()} remaining)`;
  button.addEventListener('click', () => {
    state[paneIndex].childLimits.set(path, Math.min(total, shown + 250));
    renderXmlTree(paneIndex);
  });
  row.appendChild(button);
  parent.appendChild(row);
}

function childLabel(node) {
  if (node.kind === 'text') return '#text';
  if (node.kind === 'cdata') return '#cdata';
  if (node.kind === 'comment') return '#comment';
  return node.name || node.kind || 'node';
}

function nodeSummary(node) {
  if (node.kind === 'xml-document') return `Document(${node.children?.length || 0})`;
  if (node.kind === 'element') {
    const attrCount = node.attributes?.length || 0;
    const childCount = node.children?.length || 0;
    return `Element(${attrCount} attr${attrCount === 1 ? '' : 's'}, ${childCount} child${childCount === 1 ? '' : 'ren'})`;
  }
  const value = String(node.value || '');
  return JSON.stringify(value.length > 180 ? `${value.slice(0, 180)}…` : value);
}

function buildDiffLines(diffs, paneIndex) {
  const lines = [];
  for (const diff of diffs) {
    const line = paneIndex === 0 ? diff.leftLine : diff.rightLine;
    if (!line) continue;
    let type = diff.type;
    if (type === 'added' && paneIndex === 0) continue;
    if (type === 'removed' && paneIndex === 1) continue;
    if (type !== 'added' && type !== 'removed') type = 'modified';
    lines.push({ line, type });
  }
  lines.sort((a, b) => a.line - b.line);
  return lines;
}

function xmlDiffClass(node, paneIndex) {
  const entries = state[paneIndex].diffLines;
  if (!entries.length || !node?.lineStart) return '';
  const start = lowerBound(entries, node.lineStart);
  const entry = entries[start];
  if (!entry || entry.line > (node.lineEnd || node.lineStart)) return '';
  return entry.type === 'added' ? 'diff-added' : entry.type === 'removed' ? 'diff-removed' : 'diff-modified';
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

function setStatus(message, error = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle('error', error);
}
