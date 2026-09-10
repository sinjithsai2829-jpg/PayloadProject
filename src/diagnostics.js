import {
  DIAGNOSTICS_SCHEMA_VERSION,
  MAX_DIAGNOSTIC_EVENTS,
  createDiagnosticEvent,
  sanitizeDiagnosticValue,
  trimDiagnosticEvents,
  countNewlinesFast,
} from './diagnostics-core.js';

const STORAGE_KEY = 'payloaddiff:diagnostics:v1';
const APP_VERSION = '0.3.4';
const EXPORT_FORMAT_VERSION = 'browser-v2';
const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const startedAt = performance.now();
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const compareBtn = document.querySelector('#compareBtn');
const formatBtn = document.querySelector('#formatBtn');
const clearBtn = document.querySelector('#clearBtn');
const toolbarRight = document.querySelector('.toolbar-right');

let events = loadEvents();
let persistTimer = 0;
let lastEditLog = [0, 0];

installControls();
installGlobalErrorCapture();
installInteractionLogging();
log('info', 'session.started', {
  sessionId: SESSION_ID,
  page: location.pathname,
  version: APP_VERSION,
  exportFormatVersion: EXPORT_FORMAT_VERSION,
  userAgent: navigator.userAgent,
  hardwareConcurrency: navigator.hardwareConcurrency || null,
  deviceMemoryGb: navigator.deviceMemory || null,
  viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
});

window.PayloadDiffDiagnostics = {
  log,
  export: exportDiagnostics,
  clear: clearDiagnostics,
  snapshot: captureSnapshot,
  events: () => [...events],
  version: APP_VERSION,
  exportFormatVersion: EXPORT_FORMAT_VERSION,
};

function installControls() {
  if (!toolbarRight || document.querySelector('.diagnostics-actions')) return;

  const wrap = document.createElement('span');
  wrap.className = 'diagnostics-actions';
  wrap.innerHTML = `
    <button type="button" class="diagnostics-export" title="Export privacy-safe diagnostics log">Export diagnostics</button>
    <button type="button" class="diagnostics-clear" title="Clear local diagnostics">Clear logs</button>
  `;
  toolbarRight.append(wrap);
  wrap.querySelector('.diagnostics-export')?.addEventListener('click', () => exportDiagnostics());
  wrap.querySelector('.diagnostics-clear')?.addEventListener('click', () => clearDiagnostics());
}

function installGlobalErrorCapture() {
  addEventListener('error', (event) => {
    log('error', 'window.error', {
      message: event.message,
      filename: fileNameOnly(event.filename),
      line: event.lineno,
      column: event.colno,
      error: event.error || null,
      snapshot: captureSnapshot(),
    });
  });

  addEventListener('unhandledrejection', (event) => {
    log('error', 'window.unhandledrejection', {
      reason: event.reason,
      snapshot: captureSnapshot(),
    });
  });

  addEventListener('workererror', (event) => {
    log('error', 'worker.error', {
      message: event.message,
      filename: fileNameOnly(event.filename),
      line: event.lineno,
      snapshot: captureSnapshot(),
    });
  });
}

function installInteractionLogging() {
  compareBtn?.addEventListener('click', () => markOperation('compare.click'), true);
  formatBtn?.addEventListener('click', () => markOperation('format.click'), true);
  clearBtn?.addEventListener('click', () => log('info', 'clear.click', { snapshot: captureSnapshot() }), true);

  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => log('info', 'mode.changed', { mode: button.dataset.mode }));
  });

  document.querySelectorAll('.view-tabs').forEach((tabs) => {
    tabs.addEventListener('click', (event) => {
      const button = event.target.closest('.view-btn');
      if (!button) return;
      log('debug', 'view.changed', {
        pane: Number(tabs.dataset.pane) + 1,
        view: button.dataset.view,
      });
    });
  });

  editors.forEach((editor, index) => {
    editor?.addEventListener('input', () => {
      const now = performance.now();
      if (now - lastEditLog[index] < 750) return;
      lastEditLog[index] = now;
      log('debug', 'editor.changed', {
        pane: index + 1,
        chars: editor.value.length,
        lines: countNewlinesFast(editor.value),
        compareVisible: !document.querySelector('#compareBar')?.classList.contains('hidden'),
      });
    });
  });
}

function markOperation(type) {
  const start = performance.now();
  const before = captureSnapshot();
  log('info', `${type}.started`, { snapshot: before });

  let sawBusy = document.body.classList.contains('busy');
  const maxWaitAt = start + 30000;
  const poll = () => {
    sawBusy ||= document.body.classList.contains('busy');
    const finished = sawBusy && !document.body.classList.contains('busy');
    if (finished || performance.now() >= maxWaitAt) {
      log(finished ? 'info' : 'warn', `${type}.${finished ? 'finished' : 'timeout'}`, {
        elapsedMs: Math.round(performance.now() - start),
        snapshot: captureSnapshot(),
      });
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

function captureSnapshot() {
  return {
    uptimeMs: Math.round(performance.now() - startedAt),
    appVersion: APP_VERSION,
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    mode: document.querySelector('.mode-btn.active')?.dataset.mode || null,
    syncEnabled: document.querySelector('.enhancement-sync input[type="checkbox"]')?.checked ?? null,
    compareVisible: !document.querySelector('#compareBar')?.classList.contains('hidden'),
    status: document.querySelector('#statusText')?.textContent || '',
    diffPosition: document.querySelector('#diffPosition')?.textContent || '',
    summary: document.querySelector('#compareSummary')?.textContent || '',
    panes: editors.map((editor, index) => ({
      pane: index + 1,
      chars: editor?.value.length || 0,
      lines: countNewlinesFast(editor?.value || ''),
      visibleView: visibleView(index),
      scrollTop: visibleScroller(index)?.scrollTop || 0,
      scrollHeight: visibleScroller(index)?.scrollHeight || 0,
      clientHeight: visibleScroller(index)?.clientHeight || 0,
      treeRowsRendered: panes[index]?.querySelectorAll('.tree-row').length || 0,
    })),
  };
}

function visibleView(index) {
  const pane = panes[index];
  if (!pane) return null;
  if (isVisible(pane.querySelector('.tree-view'))) return 'tree';
  if (isVisible(pane.querySelector('.editor'))) return 'code-editable';
  return 'hidden';
}

function visibleScroller(index) {
  const pane = panes[index];
  if (!pane) return null;
  return [pane.querySelector('.tree-view'), pane.querySelector('.editor')].find(isVisible) || null;
}

function isVisible(element) {
  return !!element && !element.classList.contains('hidden') && element.offsetParent !== null;
}

function log(level, type, data = {}) {
  const event = createDiagnosticEvent({ level, type, data: sanitizeDiagnosticValue(data) });
  event.sessionId = SESSION_ID;
  events.push(event);
  events = trimDiagnosticEvents(events, MAX_DIAGNOSTIC_EVENTS);
  schedulePersist();

  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug';
  try { console[method](`[PayloadDiff:${type}]`, event.data); } catch (_) {}
  return event;
}

function exportDiagnostics() {
  const report = {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    privacy: 'Payload contents are intentionally excluded. Only metadata, errors, UI state, counts, and timings are included.',
    currentSessionId: SESSION_ID,
    currentSnapshot: captureSnapshot(),
    events,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = url;
  link.download = `payloaddiff-diagnostics-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  log('info', 'diagnostics.exported', { eventCount: events.length });
}

function clearDiagnostics() {
  events = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  log('info', 'diagnostics.cleared', {});
}

function loadEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return trimDiagnosticEvents(Array.isArray(parsed) ? parsed : [], MAX_DIAGNOSTIC_EVENTS);
  } catch {
    return [];
  }
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch (_) {}
  }, 250);
}

function fileNameOnly(value) {
  if (!value) return '';
  try {
    const url = new URL(value, location.href);
    return url.pathname.split('/').pop() || url.pathname;
  } catch {
    return String(value).split('/').pop() || '';
  }
}
