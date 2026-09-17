export const HUGE_SELECT_ALL_THRESHOLD_CHARS = 256 * 1024;

const virtualSelection = new WeakMap();
const selectCollapseGuard = new WeakSet();

export function shouldVirtualizeSelectAll(valueOrLength) {
  const length = typeof valueOrLength === 'number'
    ? valueOrLength
    : String(valueOrLength ?? '').length;
  return Number.isFinite(length) && length >= HUGE_SELECT_ALL_THRESHOLD_CHARS;
}

export function isSelectAllShortcut(eventLike) {
  const key = String(eventLike?.key || '').toLowerCase();
  return key === 'a' && !!(eventLike?.metaKey || eventLike?.ctrlKey) && !eventLike?.altKey;
}

export function replacementForBeforeInput(inputType, data = null) {
  const type = String(inputType || '');
  if (type.startsWith('delete')) return '';
  if (type === 'insertLineBreak' || type === 'insertParagraph') return '\n';
  if (type === 'insertText' || type === 'insertCompositionText' || type === 'insertReplacementText') {
    return typeof data === 'string' ? data : '';
  }
  return null;
}

if (typeof document !== 'undefined') installHugeSelectAllGuard();

function installHugeSelectAllGuard() {
  const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
  if (!editors.some(Boolean)) return;

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('beforeinput', onBeforeInput, true);
  document.addEventListener('copy', onCopy, true);
  document.addEventListener('cut', onCut, true);
  document.addEventListener('paste', onPaste, true);
  document.addEventListener('pointerdown', onPointerDown, true);

  editors.forEach((editor, index) => {
    if (!editor) return;
    editor.addEventListener('select', () => catchNativeFullSelection(editor, index));
    editor.addEventListener('input', () => {
      if (virtualSelection.get(editor)?.mutating) return;
      disarm(editor, index, 'input');
    });
    editor.addEventListener('blur', () => {
      // Keep the virtual selection through keyboard-driven Copy/Cut, but clear it
      // when focus genuinely moves elsewhere on the next task.
      setTimeout(() => {
        if (document.activeElement !== editor) disarm(editor, index, 'blur');
      }, 0);
    });
  });

  installStyles();

  window.PayloadDiffHugeSelectAll = {
    thresholdChars: HUGE_SELECT_ALL_THRESHOLD_CHARS,
    isArmed: (index) => !!virtualSelection.get(editors[index])?.active,
    cancel: (index = null) => {
      if (index == null) editors.forEach((editor, paneIndex) => editor && disarm(editor, paneIndex, 'api'));
      else if (editors[index]) disarm(editors[index], index, 'api');
    },
  };
}

function onKeyDown(event) {
  const resolved = resolveEditor(event.target);
  if (!resolved) return;
  const { editor, index } = resolved;

  if (isSelectAllShortcut(event) && shouldVirtualizeSelectAll(editor.value.length)) {
    // Native textarea Select All can force Chromium to build/paint a selection
    // across millions of characters and tens of thousands of wrapped lines.
    // Keep the browser selection collapsed and model "all selected" ourselves.
    event.preventDefault();
    event.stopImmediatePropagation();
    collapseNativeSelection(editor);
    arm(editor, index, 'keyboard');
    return;
  }

  if (!virtualSelection.get(editor)?.active) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    disarm(editor, index, 'escape');
    return;
  }

  // Repeating Cmd/Ctrl+A must remain cheap and must never fall through to the
  // browser's native multi-megabyte selection implementation.
  if (isSelectAllShortcut(event)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function onBeforeInput(event) {
  const resolved = resolveEditor(event.target);
  if (!resolved) return;
  const { editor, index } = resolved;
  if (!virtualSelection.get(editor)?.active) return;

  let replacement = replacementForBeforeInput(event.inputType, event.data);
  if (replacement == null && event.inputType === 'insertFromDrop') {
    replacement = event.dataTransfer?.getData?.('text/plain') ?? null;
  }
  if (replacement == null) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  replaceWholePayload(editor, index, replacement, event.inputType || 'virtualSelectAll');
}

function onCopy(event) {
  const resolved = resolveEditor(event.target);
  if (!resolved) return;
  const { editor, index } = resolved;
  if (!virtualSelection.get(editor)?.active) return;

  if (!event.clipboardData) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  event.clipboardData.setData('text/plain', editor.value);
  log('info', 'large-payload.virtual-select-all-copied', {
    pane: index + 1,
    chars: editor.value.length,
  });
}

function onCut(event) {
  const resolved = resolveEditor(event.target);
  if (!resolved) return;
  const { editor, index } = resolved;
  if (!virtualSelection.get(editor)?.active) return;

  if (!event.clipboardData) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  event.clipboardData.setData('text/plain', editor.value);
  replaceWholePayload(editor, index, '', 'deleteByCut');
}

function onPaste(event) {
  const resolved = resolveEditor(event.target);
  if (!resolved) return;
  const { editor, index } = resolved;
  if (!virtualSelection.get(editor)?.active) return;

  const text = event.clipboardData?.getData?.('text/plain');
  if (typeof text !== 'string') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  replaceWholePayload(editor, index, text, 'insertFromPaste');
}

function onPointerDown(event) {
  const resolved = resolveEditor(event.target);
  if (!resolved) return;
  const { editor, index } = resolved;
  if (virtualSelection.get(editor)?.active) disarm(editor, index, 'pointer');
}

function catchNativeFullSelection(editor, index) {
  if (selectCollapseGuard.has(editor)) return;
  const length = editor.value.length;
  if (!shouldVirtualizeSelectAll(length)) return;
  if (editor.selectionStart !== 0 || editor.selectionEnd !== length) return;

  // This catches browser menu / context-menu Select All in addition to the
  // keyboard shortcut. Collapse immediately before the next paint whenever the
  // browser exposes the select event in time.
  selectCollapseGuard.add(editor);
  try {
    collapseNativeSelection(editor);
    arm(editor, index, 'native-select-event');
  } finally {
    queueMicrotask(() => selectCollapseGuard.delete(editor));
  }
}

function replaceWholePayload(editor, index, replacement, inputType) {
  const next = String(replacement ?? '');
  const previousChars = editor.value.length;
  const started = now();
  const item = virtualSelection.get(editor) || {};
  item.mutating = true;
  virtualSelection.set(editor, item);

  disarmVisuals(index);
  try {
    editor.value = next;
    editor.setSelectionRange(next.length, next.length);
    if (!next) {
      const fileInput = editor.closest('.pane')?.querySelector('.file-input');
      if (fileInput) fileInput.value = '';
    }

    const inputEvent = typeof InputEvent === 'function'
      ? new InputEvent('input', {
          bubbles: true,
          inputType: inputType || 'insertReplacementText',
          data: next || null,
        })
      : new Event('input', { bubbles: true });
    editor.dispatchEvent(inputEvent);
  } finally {
    item.active = false;
    item.mutating = false;
    virtualSelection.delete(editor);
  }

  log('info', next ? 'large-payload.virtual-select-all-replaced' : 'large-payload.virtual-select-all-cleared', {
    pane: index + 1,
    previousChars,
    nextChars: next.length,
    inputType: inputType || null,
    elapsedMs: Math.round((now() - started) * 10) / 10,
  });
}

function arm(editor, index, source) {
  const existing = virtualSelection.get(editor) || {};
  existing.active = true;
  existing.mutating = false;
  existing.source = source;
  existing.chars = editor.value.length;
  virtualSelection.set(editor, existing);

  const pane = editor.closest('.pane');
  pane?.classList.add('virtual-select-all-active');
  const badge = ensureBadge(index);
  if (badge) {
    badge.textContent = `All ${editor.value.length.toLocaleString()} characters selected · Delete, Cut, Copy, Paste, or type to replace`;
    badge.classList.remove('hidden');
  }

  setStatus(`File ${index + 1}: all payload content selected. Delete/Backspace clears it instantly.`);
  log('debug', 'large-payload.virtual-select-all-armed', {
    pane: index + 1,
    chars: editor.value.length,
    source,
  });
}

function disarm(editor, index, reason) {
  const item = virtualSelection.get(editor);
  if (!item?.active) return;
  item.active = false;
  if (!item.mutating) virtualSelection.delete(editor);
  disarmVisuals(index);
  log('debug', 'large-payload.virtual-select-all-cancelled', {
    pane: index + 1,
    reason,
  });
}

function disarmVisuals(index) {
  const pane = document.querySelector(`.pane[data-pane="${index}"]`) || document.querySelectorAll('.pane')[index];
  pane?.classList.remove('virtual-select-all-active');
  pane?.querySelector('.huge-select-all-badge')?.classList.add('hidden');
}

function collapseNativeSelection(editor) {
  const caret = Math.min(editor.value.length, Math.max(0, Number(editor.selectionEnd) || 0));
  try { editor.setSelectionRange(caret, caret, 'none'); } catch (_) {}
}

function resolveEditor(target) {
  const editor = target?.closest?.('.editor');
  if (!editor) return null;
  const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
  const index = editors.indexOf(editor);
  return index >= 0 ? { editor, index } : null;
}

function ensureBadge(index) {
  const pane = document.querySelector(`.pane[data-pane="${index}"]`) || document.querySelectorAll('.pane')[index];
  const wrap = pane?.querySelector('.editor-wrap');
  if (!wrap) return null;
  let badge = wrap.querySelector('.huge-select-all-badge');
  if (badge) return badge;
  badge = document.createElement('div');
  badge.className = 'huge-select-all-badge hidden';
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');
  wrap.appendChild(badge);
  return badge;
}

function setStatus(message) {
  const status = document.querySelector('#statusText');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('error');
}

function installStyles() {
  if (document.querySelector('#huge-select-all-guard-styles')) return;
  const style = document.createElement('style');
  style.id = 'huge-select-all-guard-styles';
  style.textContent = `
    .pane.virtual-select-all-active .editor-wrap {
      box-shadow: inset 0 0 0 2px rgba(37, 99, 235, .7);
    }
    .huge-select-all-badge {
      position: absolute;
      left: 12px;
      bottom: 12px;
      z-index: 70;
      max-width: calc(100% - 42px);
      padding: 7px 10px;
      border: 1px solid rgba(37, 99, 235, .4);
      border-radius: 8px;
      background: rgba(15, 23, 42, .94);
      color: #f8fafc;
      font: 600 12px/1.35 system-ui, sans-serif;
      pointer-events: none;
      box-shadow: 0 4px 14px rgba(15, 23, 42, .18);
    }
    .huge-select-all-badge.hidden { display: none !important; }
  `;
  document.head.appendChild(style);
}

function log(level, type, data) {
  try { window.PayloadDiffDiagnostics?.log?.(level, type, data); } catch (_) {}
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
