const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const compareBtn = document.querySelector('#compareBtn');
const clearBtn = document.querySelector('#clearBtn');
const compareBar = document.querySelector('#compareBar');
const statusText = document.querySelector('#statusText');

let compareActive = false;
let autoCompareTimer = 0;
let workerSeq = 0;
const workerPending = new Map();
let editSnapshot = null;
const diffsByPane = [[], []];

const worker = new Worker(new URL('./code-diff-worker.js', import.meta.url), { type: 'module' });
worker.onmessage = ({ data }) => {
  const pending = workerPending.get(data.id);
  if (!pending) return;
  workerPending.delete(data.id);
  data.ok ? pending.resolve(data.result) : pending.reject(new Error(data.error));
};

function runCodeDiff(left, right) {
  return new Promise((resolve, reject) => {
    const id = ++workerSeq;
    workerPending.set(id, { resolve, reject });
    worker.postMessage({ id, left, right });
  });
}

installStyles();
const overlays = editors.map((editor, index) => createOverlay(editor, index));

function installStyles() {
  if (document.querySelector('#editable-compare-styles')) return;
  const style = document.createElement('style');
  style.id = 'editable-compare-styles';
  style.textContent = `
    .editor-wrap.compare-editing { background: #0b1221; }
    .editor-wrap.compare-editing .editor {
      position: relative;
      z-index: 2;
      background: transparent;
      caret-color: #e5edf9;
    }
    .editor-diff-overlay {
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow: hidden;
      pointer-events: none;
      background: #0b1221;
      transition: opacity .12s ease;
    }
    body[data-compare-phase="editing"] .editor-diff-overlay,
    body[data-compare-phase="updating"] .editor-diff-overlay { opacity: .62; }
    body[data-compare-phase="paused"] .editor-diff-overlay { opacity: .42; }
    .editor-diff-band {
      position: absolute;
      left: 0;
      right: 0;
      border-left: 3px solid transparent;
      pointer-events: none;
    }
    .editor-diff-band.modified {
      background: rgba(245, 158, 11, .14);
      border-left-color: #f59e0b;
    }
    .editor-diff-band.added {
      background: rgba(34, 197, 94, .13);
      border-left-color: #22c55e;
    }
    .editor-diff-band.removed {
      background: rgba(239, 68, 68, .13);
      border-left-color: #ef4444;
    }
    .compare-bar.comparison-updating #compareSummary { opacity: .72; }
  `;
  document.head.appendChild(style);
}

function createOverlay(editor, index) {
  const wrap = editor?.closest('.editor-wrap');
  if (!wrap) return null;
  const overlay = document.createElement('div');
  overlay.className = 'editor-diff-overlay hidden';
  overlay.dataset.pane = String(index);
  wrap.insertBefore(overlay, editor);
  editor.addEventListener('scroll', () => renderOverlay(index), { passive: true });
  window.addEventListener('resize', () => renderOverlay(index), { passive: true });
  return overlay;
}

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode || 'json';
}

function isVisible(element) {
  return !!element && !element.classList.contains('hidden') && element.offsetParent !== null;
}

function setSession(active, phase = active ? 'current' : 'idle') {
  compareActive = active;
  document.body.dataset.compareSession = active ? 'active' : 'idle';
  document.body.dataset.comparePhase = phase;
  compareBar?.classList.toggle('comparison-updating', active && phase !== 'current');
}

function afterBusy(callback) {
  let sawBusy = document.body.classList.contains('busy');
  const check = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if (sawBusy && !document.body.classList.contains('busy')) {
      requestAnimationFrame(callback);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function compareSucceeded() {
  if (!compareBar || compareBar.classList.contains('hidden')) return false;
  const status = statusText?.textContent || '';
  return status.startsWith('Comparison complete') || status.startsWith('Identical');
}

compareBtn?.addEventListener('click', () => {
  const wasActive = compareActive;
  clearTimeout(autoCompareTimer);

  afterBusy(async () => {
    if (compareSucceeded()) {
      setSession(true, 'current');
      await refreshEditableDiffs();
      restoreEditSnapshot();
      return;
    }

    if (wasActive) {
      // A failed refresh must never kick the user out of compare mode. Keep the
      // last successful result visible and wait for the payload to become valid.
      setSession(true, 'paused');
      if (compareBar) compareBar.classList.remove('hidden');
      restoreEditSnapshot();
      return;
    }

    setSession(false, 'idle');
    clearEditableDiffs();
  });
}, true);

editors.forEach((editor) => {
  editor.addEventListener('input', () => {
    if (!compareActive) return;

    clearTimeout(autoCompareTimer);
    setSession(true, 'editing');

    // main.js clears its internal comparison object on input. Keep the last
    // successful comparison UI and overlay visible while the user is typing.
    requestAnimationFrame(() => {
      if (!compareActive || !compareBar) return;
      compareBar.classList.remove('hidden');
      renderOverlay(0);
      renderOverlay(1);
    });

    autoCompareTimer = window.setTimeout(() => {
      if (!compareActive) return;

      const validation = validateCurrentPayloads();
      if (!validation.ok) {
        setSession(true, 'paused');
        if (statusText) {
          statusText.textContent = `Comparison paused while editing: ${validation.message}`;
          statusText.classList.remove('error');
        }
        return;
      }

      editSnapshot = snapshotEditingPosition();
      setSession(true, 'updating');
      if (statusText) {
        statusText.textContent = 'Updating comparison…';
        statusText.classList.remove('error');
      }
      compareBtn?.click();
    }, 700);
  });
});

clearBtn?.addEventListener('click', () => {
  setSession(false, 'idle');
  clearTimeout(autoCompareTimer);
  clearEditableDiffs();
});

document.querySelectorAll('.mode-btn').forEach((button) => {
  button.addEventListener('click', () => {
    setSession(false, 'idle');
    clearTimeout(autoCompareTimer);
    clearEditableDiffs();
  });
});

// Whenever Code/Tree or Large view changes, show the overlay only when the
// actual editable textarea is the visible comparison surface.
for (const pane of panes) {
  pane.addEventListener('click', () => {
    requestAnimationFrame(() => {
      renderOverlay(0);
      renderOverlay(1);
    });
  });
}

function validateCurrentPayloads() {
  const left = editors[0]?.value || '';
  const right = editors[1]?.value || '';
  if (!left.trim() || !right.trim()) return { ok: false, message: 'both files are required' };

  if (currentMode() === 'json') {
    try {
      JSON.parse(left);
    } catch (error) {
      return { ok: false, message: `File 1 has incomplete/invalid JSON (${compactJsonError(error)})` };
    }
    try {
      JSON.parse(right);
    } catch (error) {
      return { ok: false, message: `File 2 has incomplete/invalid JSON (${compactJsonError(error)})` };
    }
    return { ok: true };
  }

  const parser = new DOMParser();
  const leftDoc = parser.parseFromString(left, 'application/xml');
  if (leftDoc.querySelector('parsererror')) return { ok: false, message: 'File 1 has incomplete/invalid XML' };
  const rightDoc = parser.parseFromString(right, 'application/xml');
  if (rightDoc.querySelector('parsererror')) return { ok: false, message: 'File 2 has incomplete/invalid XML' };
  return { ok: true };
}

function compactJsonError(error) {
  const text = error?.message || 'unable to parse';
  return text.length > 110 ? `${text.slice(0, 107)}…` : text;
}

async function refreshEditableDiffs() {
  if (!compareActive || currentMode() !== 'json') {
    clearEditableDiffs();
    return;
  }

  try {
    const result = await runCodeDiff(editors[0].value, editors[1].value);
    diffsByPane[0] = buildLineTypes(result.ordered || [], 0);
    diffsByPane[1] = buildLineTypes(result.ordered || [], 1);
    renderOverlay(0);
    renderOverlay(1);
  } catch {
    // Preserve the last successful overlay. A temporary parse problem while
    // typing must not visually exit comparison mode.
  }
}

function buildLineTypes(ordered, paneIndex) {
  const byLine = new Map();
  for (const diff of ordered) {
    const line = paneIndex === 0 ? diff.leftLine : diff.rightLine;
    if (!line) continue;
    let type = diff.type;
    if (type === 'added' && paneIndex === 0) continue;
    if (type === 'removed' && paneIndex === 1) continue;
    if (type !== 'added' && type !== 'removed') type = 'modified';
    byLine.set(line, type);
  }
  return [...byLine.entries()]
    .map(([line, type]) => ({ line, type }))
    .sort((a, b) => a.line - b.line);
}

function renderOverlay(index) {
  const editor = editors[index];
  const overlay = overlays[index];
  const wrap = editor?.closest('.editor-wrap');
  if (!editor || !overlay || !wrap) return;

  const shouldShow = compareActive && currentMode() === 'json' && isVisible(editor) && diffsByPane[index].length > 0;
  overlay.classList.toggle('hidden', !shouldShow);
  wrap.classList.toggle('compare-editing', shouldShow);
  if (!shouldShow) {
    overlay.replaceChildren();
    return;
  }

  const computed = getComputedStyle(editor);
  const lineHeight = parseFloat(computed.lineHeight) || 20;
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const firstVisible = Math.max(1, Math.floor((editor.scrollTop - paddingTop) / lineHeight) + 1);
  const lastVisible = Math.ceil((editor.scrollTop + editor.clientHeight - paddingTop) / lineHeight) + 1;
  const entries = diffsByPane[index];
  const start = lowerBound(entries, firstVisible - 2);
  const frag = document.createDocumentFragment();

  for (let i = start; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.line > lastVisible + 2) break;
    const band = document.createElement('div');
    band.className = `editor-diff-band ${entry.type}`;
    band.style.top = `${paddingTop + (entry.line - 1) * lineHeight - editor.scrollTop}px`;
    band.style.height = `${lineHeight}px`;
    frag.appendChild(band);
  }

  overlay.replaceChildren(frag);
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

function clearEditableDiffs() {
  diffsByPane[0] = [];
  diffsByPane[1] = [];
  for (let index = 0; index < 2; index += 1) {
    const overlay = overlays[index];
    const wrap = editors[index]?.closest('.editor-wrap');
    overlay?.replaceChildren();
    overlay?.classList.add('hidden');
    wrap?.classList.remove('compare-editing');
  }
}

function snapshotEditingPosition() {
  return editors.map((editor) => ({
    focused: document.activeElement === editor,
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd,
    scrollTop: editor.scrollTop,
    scrollLeft: editor.scrollLeft,
  }));
}

function restoreEditSnapshot() {
  if (!editSnapshot) return;
  const snapshot = editSnapshot;
  editSnapshot = null;

  snapshot.forEach((saved, index) => {
    const editor = editors[index];
    if (!editor) return;
    editor.scrollTop = saved.scrollTop;
    editor.scrollLeft = saved.scrollLeft;
    if (saved.focused && isVisible(editor)) {
      const end = Math.min(editor.value.length, saved.selectionEnd);
      const start = Math.min(end, saved.selectionStart);
      editor.focus({ preventScroll: true });
      try { editor.setSelectionRange(start, end); } catch (_) {}
    }
  });

  renderOverlay(0);
  renderOverlay(1);
}
