import { detectPayloadMode } from './payload-detection.js';

const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const fileInputs = [...document.querySelectorAll('.file-input')];
const modeButtons = [...document.querySelectorAll('.mode-btn')];
const statusText = document.querySelector('#statusText');

let manualOverrideUntilEmpty = false;
let autoSwitching = false;

for (const button of modeButtons) {
  button.addEventListener('click', () => {
    if (autoSwitching) return;
    manualOverrideUntilEmpty = editors.some((editor) => !!editor?.value.trim());
  });
}

for (let index = 0; index < editors.length; index += 1) {
  const editor = editors[index];
  if (!editor) continue;

  editor.addEventListener('paste', (event) => {
    const pasted = event.clipboardData?.getData('text/plain') || '';
    if (!pasted.trim()) return;
    if (!shouldDetectPaste(editor)) return;

    requestAnimationFrame(() => {
      const value = editor.value || pasted;
      detectAndApply(value, {
        source: 'paste',
        paneIndex: index,
      });
    });
  });

  editor.addEventListener('input', () => {
    if (!editors.some((candidate) => !!candidate?.value.trim())) manualOverrideUntilEmpty = false;
  });
}

for (const input of fileInputs) {
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const paneIndex = Number(input.dataset.pane) || 0;

    setTimeout(async () => {
      try {
        const editorText = editors[paneIndex]?.value || '';
        const text = editorText || await file.text();
        detectAndApply(text, {
          source: 'upload',
          paneIndex,
          filename: file.name,
          mimeType: file.type,
        });
      } catch (_) {}
    }, 0);
  });
}

window.PayloadDiffAutoDetect = {
  detect: (text, options = {}) => detectPayloadMode(text, options),
  apply: (text, options = {}) => detectAndApply(text, options),
  switchMode: (mode) => switchModeAutomatically(mode),
};

function detectAndApply(text, options = {}) {
  if (!String(text ?? '').trim()) return null;
  const detected = detectPayloadMode(text, options);
  if (!detected.mode) return detected;

  const current = activeMode();
  const replacementSource = options.source === 'upload' || options.source === 'paste-button';
  const confident = detected.confidence >= 0.8;
  const sourceHint = replacementSource && detected.confidence >= 0.6;
  if (!confident && !sourceHint) return detected;

  if (manualOverrideUntilEmpty && !replacementSource) return detected;
  if (replacementSource) manualOverrideUntilEmpty = false;
  if (detected.mode === current) return detected;
  if (!switchModeAutomatically(detected.mode)) return detected;

  if (statusText) {
    statusText.textContent = `${detected.mode.toUpperCase()} detected from ${options.source || 'payload'}.`;
    statusText.classList.remove('error');
  }
  try {
    window.PayloadDiffDiagnostics?.log?.('info', 'payload.type.detected', {
      mode: detected.mode,
      confidence: detected.confidence,
      source: options.source || 'payload',
      pane: Number(options.paneIndex) + 1 || undefined,
      filename: options.filename || undefined,
      reason: detected.reason,
    });
  } catch (_) {}

  return detected;
}

function switchModeAutomatically(mode) {
  if (mode !== 'json' && mode !== 'xml') return false;
  if (mode === activeMode()) return true;

  const button = modeButtons.find((candidate) => candidate.dataset.mode === mode);
  if (!button) return false;

  autoSwitching = true;
  try {
    button.click();
  } finally {
    autoSwitching = false;
  }
  return activeMode() === mode;
}

function activeMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode === 'xml' ? 'xml' : 'json';
}

function shouldDetectPaste(editor) {
  if (!editor.value.trim()) return true;
  const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : 0;
  const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : 0;
  return start === 0 && end === editor.value.length;
}
