const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const statusText = document.querySelector('#statusText');
const compareBar = document.querySelector('#compareBar');
const compareSummary = document.querySelector('#compareSummary');
const diffPosition = document.querySelector('#diffPosition');
const formatBtn = document.querySelector('#formatBtn');
const compareBtn = document.querySelector('#compareBtn');
const clearBtn = document.querySelector('#clearBtn');

const formatWorkers = [createWorkerClient(), createWorkerClient()];
const compareWorker = createWorkerClient();
let largeCompare = null;
let largeCompareIndex = -1;
let operation = 0;

// Capture at the document boundary so giant payloads never reach legacy handlers
// that were designed for ordinary documents and may scan/split the full source.
document.addEventListener('change', onCaptureChange, true);
document.addEventListener('paste', onCapturePaste, true);
document.addEventListener('click', onCaptureClick, true);
window.addEventListener('payloaddiff:large-payload-mode-changed', () => {
  if (!hasLargePane()) resetLargeCompare();
});

window.PayloadDiffLargePayloadController = {
  hasLargePane,
  format: formatLargeWorkspace,
  compare: compareLargeWorkspace,
  getComparison: () => largeCompare,
};

async function onCaptureChange(event) {
  const input = event.target?.closest?.('.file-input');
  if (!input) return;
  const file = input.files?.[0];
  if (!file || !window.PayloadDiffLargePayload?.shouldVirtualizeSize?.(file.size)) return;

  event.stopImmediatePropagation();
  const index = Number(input.dataset.pane) || 0;
  setStatus(`Loading ${(file.size / 1024 / 1024).toFixed(1)} MB into File ${index + 1}…`);
  try {
    const text = await window.PayloadDiffLargePayload.readFile(index, file, { dispatchInput: false, source: 'upload' });
    switchModeFromHint(text, file.name, file.type);
    setFileMeta(index, file.name, file.size);
    markPayloadChanged(index, 'upload');
    resetLargeCompare();
    setStatus(`File ${index + 1} loaded in virtualized large-payload mode.`);
  } catch (error) {
    setStatus(error?.message || 'Unable to load large file.', true);
  }
}

function onCapturePaste(event) {
  const editor = event.target?.closest?.('.editor, .large-payload-view');
  if (!editor) return;
  const index = paneIndexFor(editor);
  if (index < 0) return;
  const text = event.clipboardData?.getData('text/plain') || '';
  if (!window.PayloadDiffLargePayload?.shouldVirtualizeText?.(text)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  replaceLarge(index, text, 'paste').catch((error) => setStatus(error.message, true));
}

function onCaptureClick(event) {
  const pasteButton = event.target?.closest?.('.paste-btn');
  if (pasteButton) {
    const index = Number(pasteButton.dataset.pane) || 0;
    if (window.PayloadDiffLargePayload?.isLarge?.(index)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      pasteLargeFromClipboard(index).catch((error) => setStatus(error.message, true));
      return;
    }
  }

  if (event.target?.closest?.('#formatBtn') && hasLargePane()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    formatLargeWorkspace();
    return;
  }

  if (event.target?.closest?.('#compareBtn') && hasLargePane()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    compareLargeWorkspace();
    return;
  }

  const nav = event.target?.closest?.('#firstDiff, #prevDiff, #nextDiff, #lastDiff');
  if (nav && largeCompare) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const total = largeCompare.diffs?.length || 0;
    if (!total) return;
    if (nav.id === 'firstDiff') largeCompareIndex = 0;
    else if (nav.id === 'lastDiff') largeCompareIndex = total - 1;
    else if (nav.id === 'prevDiff') largeCompareIndex = (largeCompareIndex - 1 + total) % total;
    else largeCompareIndex = (largeCompareIndex + 1) % total;
    revealLargeDiff();
  }
}

async function pasteLargeFromClipboard(index) {
  if (!navigator.clipboard?.readText) throw new Error('Clipboard access is unavailable.');
  const text = await navigator.clipboard.readText();
  if (!text) return;
  await replaceLarge(index, text, 'paste-button');
}

async function replaceLarge(index, text, source) {
  await window.PayloadDiffLargePayload.replace(index, text, { dispatchInput: false, source });
  switchModeFromHint(text);
  setFileMeta(index, 'Pasted payload', byteLength(text));
  markPayloadChanged(index, source);
  resetLargeCompare();
  setStatus(`File ${index + 1} ready in virtualized large-payload mode.`);
}

async function formatLargeWorkspace() {
  const myOperation = ++operation;
  const targets = [0, 1].filter((index) => !!editors[index]?.value.trim());
  if (!targets.length) return setStatus('Paste or upload a payload first.', true);

  setBusy(true, 'Formatting large payloads in parallel workers…');
  try {
    const mode = currentMode();
    const results = await Promise.all(targets.map((index) => formatWorkers[index].run('format', {
      mode,
      text: editors[index].value,
      paneIndex: index,
      includeParsed: false,
      includeIssues: false,
      performanceMode: true,
    }).then((result) => ({ index, result }))));
    if (myOperation !== operation) return;

    for (const { index, result } of results) {
      await window.PayloadDiffLargePayload.replace(index, result.formatted, {
        dispatchInput: false,
        source: 'format',
      });
      setFileMeta(index, panes[index]?.querySelector('.file-meta')?.textContent?.split(' • ')[0] || 'Payload', result.bytes, result.lineCount, result.elapsedMs);
      markPayloadChanged(index, 'format');
    }
    resetLargeCompare();
    setStatus('Formatting complete.');
  } catch (error) {
    setStatus(error?.message || 'Formatting failed.', true);
  } finally {
    setBusy(false);
  }
}

async function compareLargeWorkspace() {
  const left = editors[0]?.value || '';
  const right = editors[1]?.value || '';
  if (!left.trim() || !right.trim()) return setStatus('Both File 1 and File 2 are required.', true);

  const myOperation = ++operation;
  setBusy(true, 'Comparing large payloads in background worker…');
  try {
    const mode = currentMode();
    const result = await compareWorker.run('compare', {
      mode,
      left,
      right,
      performanceMode: true,
    });
    if (myOperation !== operation) return;

    // Compare already formats/parses each side once. Reuse those outputs instead
    // of running a second format pass before or after comparison.
    if (typeof result.leftFormatted === 'string') {
      await window.PayloadDiffLargePayload.replace(0, result.leftFormatted, { dispatchInput: false, source: 'compare' });
    }
    if (typeof result.rightFormatted === 'string') {
      await window.PayloadDiffLargePayload.replace(1, result.rightFormatted, { dispatchInput: false, source: 'compare' });
    }

    largeCompare = result;
    largeCompareIndex = result.identical || !result.diffs?.length ? -1 : 0;
    renderComparison();
    if (largeCompareIndex >= 0) revealLargeDiff();
    markPayloadChanged(0, 'compare');
    markPayloadChanged(1, 'compare');
    setStatus(result.identical ? `Identical (${result.elapsedMs} ms)` : `Comparison complete (${result.elapsedMs} ms)`);
  } catch (error) {
    setStatus(error?.message || 'Comparison failed.', true);
  } finally {
    setBusy(false);
  }
}

function renderComparison() {
  if (!largeCompare || !compareBar || !compareSummary) return;
  const s = largeCompare.summary || { added: 0, removed: 0, modified: 0 };
  compareBar.classList.remove('hidden', 'live-stale', 'live-invalid');
  compareSummary.innerHTML = largeCompare.identical
    ? '<strong class="same">No differences found.</strong>'
    : `<strong>${s.added + s.removed + s.modified} changes</strong> <span class="added">+${s.added} added</span> <span class="removed">−${s.removed} removed</span> <span class="modified">~${s.modified} modified</span>${s.truncated ? ' <span class="warn">(navigation capped)</span>' : ''}`;
  updateNavigator();
}

function updateNavigator() {
  const total = largeCompare?.diffs?.length || 0;
  if (diffPosition) diffPosition.textContent = total && largeCompareIndex >= 0 ? `${largeCompareIndex + 1} of ${total}` : '0 of 0';
  for (const id of ['firstDiff', 'prevDiff', 'nextDiff', 'lastDiff']) {
    const button = document.querySelector(`#${id}`);
    if (button) button.disabled = !total;
  }
}

function revealLargeDiff() {
  const diff = largeCompare?.diffs?.[largeCompareIndex];
  if (!diff) return;
  const leftLine = Number(diff.leftLine || diff.rightLine);
  const rightLine = Number(diff.rightLine || diff.leftLine);
  if (leftLine > 0) window.PayloadDiffLargePayload?.revealLine?.(0, leftLine, 0.42);
  if (rightLine > 0) window.PayloadDiffLargePayload?.revealLine?.(1, rightLine, 0.42);

  window.dispatchEvent(new CustomEvent('payloaddiff:large-comparison-updated', {
    detail: { diffs: largeCompare.diffs, currentDiffIndex: largeCompareIndex },
  }));
  updateNavigator();
}

function resetLargeCompare() {
  largeCompare = null;
  largeCompareIndex = -1;
  if (compareBar) compareBar.classList.add('hidden');
  if (compareSummary) compareSummary.innerHTML = '';
  updateNavigator();
}

function createWorkerClient() {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let seq = 0;
  const pending = new Map();
  worker.onmessage = ({ data }) => {
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id);
    data.ok ? item.resolve(data.result) : item.reject(new Error(data.error || 'Worker operation failed.'));
  };
  return {
    run(task, payload) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, task, payload });
      });
    },
  };
}

function hasLargePane() {
  return [0, 1].some((index) => window.PayloadDiffLargePayload?.isLarge?.(index));
}

function switchModeFromHint(text, filename = '', mimeType = '') {
  const mode = cheapMode(text, filename, mimeType);
  if (mode) window.PayloadDiffAutoDetect?.switchMode?.(mode);
}

function cheapMode(text, filename = '', mimeType = '') {
  const sample = String(text ?? '').slice(0, 4096).replace(/^\uFEFF/, '').trimStart();
  if (sample.startsWith('<')) return 'xml';
  if (sample.startsWith('{') || sample.startsWith('[')) return 'json';
  const lowerName = String(filename).toLowerCase();
  const lowerMime = String(mimeType).toLowerCase();
  if (lowerName.endsWith('.xml') || lowerMime.includes('xml')) return 'xml';
  if (lowerName.endsWith('.json') || lowerMime.includes('json')) return 'json';
  return null;
}

function markPayloadChanged(index, source) {
  window.dispatchEvent(new CustomEvent('payloaddiff:panel-name-changed', { detail: { paneIndex: index, source: `large-payload:${source}` } }));
}

function setFileMeta(index, name, bytes, lineCount = null, elapsedMs = null) {
  const meta = panes[index]?.querySelector('.file-meta');
  if (!meta) return;
  const pieces = [name || `File ${index + 1}`];
  if (Number.isFinite(lineCount)) pieces.push(`${Number(lineCount).toLocaleString()} lines`);
  if (Number.isFinite(bytes)) pieces.push(formatBytes(bytes));
  if (Number.isFinite(elapsedMs)) pieces.push(`${Math.round(elapsedMs)} ms`);
  meta.textContent = pieces.join(' • ');
}

function setBusy(value, message = '') {
  document.body.classList.toggle('busy', value);
  for (const button of [formatBtn, compareBtn, clearBtn]) if (button) button.disabled = value;
  if (message) setStatus(message);
}

function setStatus(message, error = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle('error', error);
}

function paneIndexFor(element) {
  const pane = element?.closest?.('.pane');
  return pane ? panes.indexOf(pane) : -1;
}

function byteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return String(text ?? '').length;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode === 'xml' ? 'xml' : 'json';
}
