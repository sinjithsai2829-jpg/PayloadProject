const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const statusText = document.querySelector('#statusText');
const formatBtn = document.querySelector('#formatBtn');
const clearBtn = document.querySelector('#clearBtn');

const state = [0, 1].map(() => ({ issues: [], timer: 0, request: 0 }));
const rails = [];
const lineLayers = [];
const countBadges = [];
let seq = 0;
const pending = new Map();

const worker = new Worker(new URL('./syntax-issues-worker.js', import.meta.url), { type: 'module' });
worker.onmessage = ({ data }) => {
  const item = pending.get(data.id);
  if (!item) return;
  pending.delete(data.id);
  if (data.ok) item.resolve(data.issues || []);
  else item.reject(new Error(data.error || 'Syntax validation failed.'));
};

installStyles();
for (let index = 0; index < editors.length; index += 1) installPane(index);

window.PayloadDiffSyntaxIssues = {
  refresh: (index = null) => index == null ? validateAll() : validatePane(index),
  getIssues: (index) => [...(state[index]?.issues || [])],
};

function installPane(index) {
  const editor = editors[index];
  const pane = panes[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!editor || !pane || !wrap) return;

  const lineLayer = document.createElement('div');
  lineLayer.className = 'syntax-line-layer';
  lineLayer.setAttribute('aria-hidden', 'true');
  wrap.appendChild(lineLayer);
  lineLayers[index] = lineLayer;

  const rail = document.createElement('div');
  rail.className = 'syntax-error-rail';
  rail.setAttribute('aria-label', `File ${index + 1} syntax errors`);
  wrap.appendChild(rail);
  rails[index] = rail;

  const badge = document.createElement('span');
  badge.className = 'syntax-issue-count hidden';
  const tools = pane.querySelector('.pane-tools') || pane.querySelector('.view-tabs')?.parentElement;
  tools?.appendChild(badge);
  countBadges[index] = badge;

  editor.addEventListener('input', () => scheduleValidation(index, 320));
  editor.addEventListener('scroll', () => renderVisibleLineBands(index), { passive: true });
  pane.querySelector('.view-tabs')?.addEventListener('click', () => requestAnimationFrame(() => updateVisibility(index)));

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      renderRail(index);
      renderVisibleLineBands(index);
    });
    observer.observe(editor);
  }
}

formatBtn?.addEventListener('click', () => afterBusy(validateAll), true);
clearBtn?.addEventListener('click', () => requestAnimationFrame(clearAll), true);

document.querySelectorAll('.mode-btn').forEach((button) => {
  button.addEventListener('click', () => requestAnimationFrame(validateAll), true);
});

document.querySelectorAll('.file-input').forEach((input) => {
  input.addEventListener('change', () => setTimeout(validateAll, 0));
});

function scheduleValidation(index, delay) {
  clearTimeout(state[index].timer);
  state[index].timer = setTimeout(() => validatePane(index), delay);
}

async function validateAll() {
  await Promise.allSettled(editors.map((_, index) => validatePane(index)));
}

async function validatePane(index) {
  const editor = editors[index];
  if (!editor) return;
  const text = editor.value;
  if (!text.trim()) {
    applyIssues(index, []);
    return;
  }

  const mode = currentMode();
  const request = ++state[index].request;
  try {
    const issues = await runValidation(mode, text);
    if (request !== state[index].request) return;
    applyIssues(index, issues);
  } catch {
    if (request !== state[index].request) return;
    applyIssues(index, []);
  }
}

function runValidation(mode, text) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, mode, text });
  });
}

function applyIssues(index, issues) {
  state[index].issues = Array.isArray(issues) ? issues : [];
  renderBadge(index);
  renderRail(index);
  renderVisibleLineBands(index);
  updateVisibility(index);

  panes[index]?.classList.toggle('has-syntax-errors', state[index].issues.length > 0);
  window.dispatchEvent(new CustomEvent('payloaddiff:syntax-issues-updated', {
    detail: { paneIndex: index, issues: state[index].issues },
  }));
}

function renderBadge(index) {
  const badge = countBadges[index];
  if (!badge) return;
  const count = state[index].issues.length;
  badge.classList.toggle('hidden', count === 0);
  badge.textContent = count ? `${count} ${count === 1 ? 'error' : 'errors'}` : '';
  if (count) badge.title = state[index].issues[0].message;
}

function renderRail(index) {
  const rail = rails[index];
  const editor = editors[index];
  if (!rail || !editor) return;
  rail.replaceChildren();

  const issues = state[index].issues;
  if (!issues.length) return;
  const totalLines = Math.max(1, countLines(editor.value));
  const fragment = document.createDocumentFragment();

  for (let issueIndex = 0; issueIndex < issues.length; issueIndex += 1) {
    const issue = issues[issueIndex];
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'syntax-error-marker';
    marker.style.top = `${Math.min(99.2, Math.max(0, ((issue.line - 1) / Math.max(1, totalLines - 1)) * 100))}%`;
    marker.title = `Line ${issue.line}, column ${issue.column}: ${issue.message}`;
    marker.setAttribute('aria-label', marker.title);
    marker.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      revealIssue(index, issueIndex);
    });
    fragment.appendChild(marker);
  }

  rail.appendChild(fragment);
}

function renderVisibleLineBands(index) {
  const editor = editors[index];
  const layer = lineLayers[index];
  if (!editor || !layer) return;
  layer.replaceChildren();
  if (!state[index].issues.length || editor.classList.contains('hidden')) return;

  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const first = Math.max(1, Math.floor((editor.scrollTop - paddingTop) / lineHeight) + 1);
  const last = Math.ceil((editor.scrollTop + editor.clientHeight - paddingTop) / lineHeight) + 1;
  const fragment = document.createDocumentFragment();
  const seenLines = new Set();

  for (const issue of state[index].issues) {
    if (issue.line < first - 1 || issue.line > last + 1 || seenLines.has(issue.line)) continue;
    seenLines.add(issue.line);
    const band = document.createElement('div');
    band.className = 'syntax-error-line';
    band.style.top = `${paddingTop + (issue.line - 1) * lineHeight - editor.scrollTop}px`;
    band.style.height = `${lineHeight}px`;
    band.title = issue.message;
    fragment.appendChild(band);
  }

  layer.appendChild(fragment);
}

function revealIssue(index, issueIndex) {
  const issue = state[index].issues[issueIndex];
  const editor = editors[index];
  if (!issue || !editor) return;

  const codeTab = panes[index]?.querySelector('.view-btn[data-view="code"]');
  if (codeTab && !codeTab.classList.contains('active')) codeTab.click();

  requestAnimationFrame(() => {
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
    editor.scrollTop = Math.max(0, (issue.line - 1) * lineHeight - editor.clientHeight * 0.42);
    const offset = Math.max(0, Math.min(issue.offset ?? offsetForLineColumn(editor.value, issue.line, issue.column), editor.value.length));
    editor.focus();
    editor.setSelectionRange(offset, Math.min(editor.value.length, offset + 1));
    renderVisibleLineBands(index);
    setStatus(`File ${index + 1} · line ${issue.line}, column ${issue.column}: ${issue.message}`, true);
  });
}

function updateVisibility(index) {
  const treeActive = panes[index]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
  rails[index]?.classList.toggle('hidden', !!treeActive);
  lineLayers[index]?.classList.toggle('hidden', !!treeActive);
}

function clearAll() {
  for (let index = 0; index < state.length; index += 1) {
    clearTimeout(state[index].timer);
    state[index].request += 1;
    applyIssues(index, []);
  }
}

function afterBusy(callback) {
  let sawBusy = document.body.classList.contains('busy');
  const started = performance.now();
  const check = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if ((sawBusy && !document.body.classList.contains('busy')) || performance.now() - started > 30000) {
      requestAnimationFrame(callback);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode === 'xml' ? 'xml' : 'json';
}

function setStatus(message, error = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle('error', error);
}

function countLines(text) {
  if (!text) return 1;
  let count = 1;
  for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) count += 1;
  return count;
}

function offsetForLineColumn(text, line, column) {
  let currentLine = 1;
  let offset = 0;
  while (offset < text.length && currentLine < line) {
    if (text.charCodeAt(offset) === 10) currentLine += 1;
    offset += 1;
  }
  return Math.min(text.length, offset + Math.max(0, column - 1));
}

function installStyles() {
  if (document.querySelector('#syntax-marker-styles')) return;
  const style = document.createElement('style');
  style.id = 'syntax-marker-styles';
  style.textContent = `
    .syntax-error-rail {
      position: absolute;
      z-index: 12;
      top: 4px;
      right: 2px;
      bottom: 4px;
      width: 10px;
      pointer-events: none;
    }
    .syntax-error-marker {
      position: absolute;
      left: 0;
      width: 9px;
      height: 5px;
      min-width: 0;
      padding: 0;
      margin: 0;
      border: 0;
      border-radius: 2px;
      background: #ef4444;
      box-shadow: 0 0 0 1px rgba(127,29,29,.9), 0 0 5px rgba(239,68,68,.55);
      transform: translateY(-2px);
      pointer-events: auto;
      cursor: pointer;
    }
    .syntax-error-marker:hover { background: #f87171; transform: translateY(-2px) scaleX(1.2); }
    .syntax-line-layer {
      position: absolute;
      z-index: 7;
      inset: 0 14px 0 64px;
      overflow: hidden;
      pointer-events: none;
    }
    .syntax-error-line {
      position: absolute;
      left: 0;
      right: 0;
      background: rgba(239,68,68,.10);
      border-left: 3px solid #ef4444;
      box-shadow: inset 0 -1px 0 rgba(248,113,113,.24);
    }
    .syntax-issue-count {
      flex: 0 0 auto;
      margin-left: 6px;
      padding: 3px 7px;
      border: 1px solid rgba(239,68,68,.55);
      border-radius: 999px;
      background: rgba(127,29,29,.24);
      color: #fca5a5;
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
    }
    .has-syntax-errors .editor-line-gutter { border-right-color: rgba(239,68,68,.42); }
  `;
  document.head.appendChild(style);
}
