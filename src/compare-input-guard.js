const compareBtn = document.querySelector('#compareBtn');
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')].filter(Boolean);
const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

let guarding = false;
let guardRun = 0;
let blockedWrites = 0;
let before = [];

if (compareBtn && valueDescriptor?.get && valueDescriptor?.set) {
  for (const editor of editors) installGuardedValue(editor);
  compareBtn.addEventListener('click', beginCompareGuard, true);
}

function installGuardedValue(editor) {
  Object.defineProperty(editor, 'value', {
    configurable: true,
    enumerable: valueDescriptor.enumerable,
    get() {
      return valueDescriptor.get.call(this);
    },
    set(next) {
      if (guarding) {
        blockedWrites += 1;
        try {
          window.PayloadDiffDiagnostics?.log?.('warn', 'compare.editor-write-blocked', {
            pane: this === editors[1] ? 2 : 1,
            attemptedChars: String(next ?? '').length,
            existingChars: valueDescriptor.get.call(this).length,
            mode: currentMode(),
          });
        } catch (_) {}
        return;
      }
      valueDescriptor.set.call(this, next);
    },
  });
}

function beginCompareGuard() {
  if (guarding) return;
  if (editors.some((editor) => !editor.value.trim())) return;

  guarding = true;
  blockedWrites = 0;
  before = editors.map(snapshotEditor);
  const run = ++guardRun;
  const started = performance.now();
  let sawBusy = document.body.classList.contains('busy');
  let idleFrames = 0;

  try {
    window.PayloadDiffDiagnostics?.log?.('debug', 'compare.input-guard-started', {
      mode: currentMode(),
      panes: before,
    });
  } catch (_) {}

  const poll = () => {
    if (run !== guardRun || !guarding) return;
    const busy = document.body.classList.contains('busy');
    sawBusy ||= busy;

    if (sawBusy && !busy) {
      finishCompareGuard(run, started);
      return;
    }

    if (!sawBusy && !busy) {
      idleFrames += 1;
      // If another listener intentionally handles comparison without using the
      // global busy flag, do not keep editor writes blocked indefinitely.
      if (idleFrames >= 8) {
        finishCompareGuard(run, started);
        return;
      }
    } else {
      idleFrames = 0;
    }

    if (performance.now() - started > 30000) {
      finishCompareGuard(run, started);
      return;
    }
    requestAnimationFrame(poll);
  };

  requestAnimationFrame(poll);
}

function finishCompareGuard(run, started) {
  if (run !== guardRun) return;
  guarding = false;
  const after = editors.map(snapshotEditor);
  const changed = before.some((item, index) => item.chars !== after[index]?.chars || item.lines !== after[index]?.lines);

  try {
    window.PayloadDiffDiagnostics?.log?.(changed ? 'error' : 'debug', 'compare.input-guard-finished', {
      mode: currentMode(),
      elapsedMs: Math.round(performance.now() - started),
      blockedWrites,
      changed,
      before,
      after,
    });
  } catch (_) {}

  // Compare is a read-only operation. If content still changed, another code
  // path bypassed textarea.value; surface that invariant violation immediately.
  if (changed) {
    window.dispatchEvent(new CustomEvent('payloaddiff:compare-input-mutated', {
      detail: { mode: currentMode(), before, after },
    }));
  }
}

function snapshotEditor(editor, index) {
  const value = editor?.value || '';
  return {
    pane: index + 1,
    chars: value.length,
    lines: value ? value.split('\n').length : 0,
    selectionStart: editor?.selectionStart ?? 0,
    selectionEnd: editor?.selectionEnd ?? 0,
  };
}

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode === 'xml' ? 'xml' : 'json';
}

window.PayloadDiffCompareInputGuard = {
  isGuarding: () => guarding,
  getBlockedWriteCount: () => blockedWrites,
};
