import { detectPayloadMode } from './payload-detection.js';

const DEFAULT_MIN_CONFIDENCE = 0.8;

export function detectActionPayloadMode(payloads, options = {}) {
  const minConfidence = Number.isFinite(options.minConfidence)
    ? options.minConfidence
    : DEFAULT_MIN_CONFIDENCE;

  const detections = (payloads || [])
    .filter((payload) => String(payload?.text ?? '').trim())
    .map((payload, index) => {
      const detection = detectPayloadMode(payload.text, payload);
      return {
        paneIndex: Number.isInteger(payload.paneIndex) ? payload.paneIndex : index,
        mode: detection.mode,
        confidence: detection.confidence,
        reason: detection.reason,
      };
    });

  const confident = detections.filter(
    (detection) => detection.mode && detection.confidence >= minConfidence,
  );
  const modes = [...new Set(confident.map((detection) => detection.mode))];

  if (modes.length > 1) {
    return { mode: null, conflict: true, detections, confident };
  }

  return { mode: modes[0] || null, conflict: false, detections, confident };
}

export function installPayloadActionModeGuard(root = document) {
  const formatButton = root.querySelector?.('#formatBtn');
  const compareButton = root.querySelector?.('#compareBtn');
  const editors = [root.querySelector?.('#editor0'), root.querySelector?.('#editor1')];
  const statusText = root.querySelector?.('#statusText');

  if (!formatButton && !compareButton) return;

  formatButton?.addEventListener('click', preflight, true);
  compareButton?.addEventListener('click', preflight, true);

  function preflight(event) {
    const action = event.currentTarget === compareButton ? 'compare' : 'format';
    const payloads = editors
      .map((editor, paneIndex) => ({ paneIndex, text: editor?.value || '' }))
      .filter((payload) => payload.text.trim());

    if (!payloads.length) return;

    const result = detectActionPayloadMode(payloads);
    const beforeMode = activeMode(root);

    if (result.conflict) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const conflictText = result.confident
        .map((detection) => `File ${detection.paneIndex + 1} is ${detection.mode.toUpperCase()}`)
        .join(' while ');
      setStatus(
        statusText,
        `${conflictText}. Both panes must use the same payload type before ${action === 'compare' ? 'comparing' : 'formatting both'}.`,
        true,
      );
      logDiagnostic('warn', 'payload.action-mode-conflict', {
        action,
        beforeMode,
        detections: diagnosticDetections(result.detections),
      });
      return;
    }

    if (!result.mode) {
      logDiagnostic('debug', 'payload.action-mode-ambiguous', {
        action,
        beforeMode,
        detections: diagnosticDetections(result.detections),
      });
      return;
    }

    if (result.mode === beforeMode) {
      logDiagnostic('debug', 'payload.action-mode-confirmed', {
        action,
        mode: beforeMode,
        detections: diagnosticDetections(result.detections),
      });
      return;
    }

    const switched = window.PayloadDiffAutoDetect?.switchMode?.(result.mode)
      ?? fallbackSwitchMode(root, result.mode);
    if (!switched || activeMode(root) !== result.mode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setStatus(statusText, `Detected ${result.mode.toUpperCase()}, but the mode switch could not be completed.`, true);
      logDiagnostic('error', 'payload.action-mode-switch-failed', {
        action,
        beforeMode,
        detectedMode: result.mode,
        detections: diagnosticDetections(result.detections),
      });
      return;
    }

    setStatus(statusText, `${result.mode.toUpperCase()} detected. ${action === 'compare' ? 'Comparing' : 'Formatting'} as ${result.mode.toUpperCase()}…`, false);
    logDiagnostic('info', 'payload.action-mode-detected', {
      action,
      beforeMode,
      detectedMode: result.mode,
      detections: diagnosticDetections(result.detections),
    });
  }
}

function fallbackSwitchMode(root, mode) {
  const modeButton = root.querySelector?.(`.mode-btn[data-mode="${mode}"]`);
  if (!modeButton) return false;
  modeButton.click();
  return activeMode(root) === mode;
}

function activeMode(root) {
  return root.querySelector?.('.mode-btn.active')?.dataset.mode === 'xml' ? 'xml' : 'json';
}

function diagnosticDetections(detections) {
  return detections.map((detection) => ({
    pane: detection.paneIndex + 1,
    mode: detection.mode,
    confidence: detection.confidence,
    reason: detection.reason,
  }));
}

function setStatus(element, text, isError) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('error', !!isError);
}

function logDiagnostic(level, type, data) {
  try { window.PayloadDiffDiagnostics?.log?.(level, type, data); } catch (_) {}
}

if (typeof document !== 'undefined') installPayloadActionModeGuard(document);
