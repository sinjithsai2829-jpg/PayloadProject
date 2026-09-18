import {
  DIAGNOSTICS_SCHEMA_VERSION,
  MAX_DIAGNOSTIC_EVENTS,
  createDiagnosticEvent,
  sanitizeDiagnosticValue,
  trimDiagnosticEvents,
  countNewlinesFast,
  summarizeDiagnosticEvents,
} from './diagnostics-core.js';

const STORAGE_KEY = 'payloaddiff:diagnostics:v2';
const LEGACY_STORAGE_KEY = 'payloaddiff:diagnostics:v1';
const APP_VERSION = '0.3.4';
const EXPORT_FORMAT_VERSION = 'browser-v4';
const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const startedAt = performance.now();
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const panes = [...document.querySelectorAll('.pane')];
const compareBtn = document.querySelector('#compareBtn');
const formatBtn = document.querySelector('#formatBtn');
const clearBtn = document.querySelector('#clearBtn');
const toolbarRight = document.querySelector('.toolbar-right');
const compareBar = document.querySelector('#compareBar');

let events = loadEvents();
let persistTimer = 0;
let lastEditLog = [0, 0];
let lastScrollLog = [0, 0];
let lastPointerLog = 0;
let lastAnomalySignature = '';
let lastSnapshotSignature = '';
let operationSequence = 0;
let longTaskCount = 0;
let longTaskTotalMs = 0;
let layoutShiftScore = 0;
let resizeCount = 0;
let mutationFrame = 0;
let mutationTimer = 0;

installControls();
installGlobalErrorCapture();
installInteractionLogging();
installLifecycleLogging();
installPerformanceLogging();
installStateObservers();

window.PayloadDiffDiagnostics = {
  log,
  export: exportDiagnostics,
  clear: clearDiagnostics,
  snapshot: captureSnapshot,
  events: () => [...events],
  anomalies: detectAnomalies,
  checkpoint: (reason = 'manual') => checkpoint(reason, 'info'),
  version: APP_VERSION,
  exportFormatVersion: EXPORT_FORMAT_VERSION,
  schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
};

log('info', 'session.started', {
  sessionId: SESSION_ID,
  page: location.pathname,
  version: APP_VERSION,
  diagnosticsSchemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
  exportFormatVersion: EXPORT_FORMAT_VERSION,
  environment: captureEnvironment(),
  snapshot: captureSnapshot(),
});
requestAnimationFrame(() => checkpoint('session.first-frame', 'debug'));
setTimeout(() => checkpoint('session.settled', 'debug'), 800);

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
      anomalies: detectAnomalies(),
    });
  });

  addEventListener('unhandledrejection', (event) => {
    log('error', 'window.unhandledrejection', {
      reason: event.reason,
      snapshot: captureSnapshot(),
      anomalies: detectAnomalies(),
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

  document.addEventListener('securitypolicyviolation', (event) => {
    log('warn', 'security.policy-violation', {
      violatedDirective: event.violatedDirective,
      effectiveDirective: event.effectiveDirective,
      blockedHost: safeHost(event.blockedURI),
      sourceFile: fileNameOnly(event.sourceFile),
      line: event.lineNumber,
      column: event.columnNumber,
    });
  });
}

function installInteractionLogging() {
  compareBtn?.addEventListener('click', () => markOperation('compare'), true);
  formatBtn?.addEventListener('click', () => markOperation('format'), true);
  clearBtn?.addEventListener('click', () => markOperation('clear'), true);

  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('button, .upload-btn, input[type="checkbox"], .tree-row, .code-fold-toggle, .fold-row-toggle');
    if (!target) return;
    log('debug', 'ui.click', describeControl(target));
    schedulePostInteractionCheck('click');
  }, true);

  document.addEventListener('pointerdown', (event) => {
    const now = performance.now();
    if (now - lastPointerLog < 250) return;
    lastPointerLog = now;
    const paneIndex = paneIndexForElement(event.target);
    log('debug', 'ui.pointerdown', {
      pointerType: event.pointerType || 'unknown',
      button: event.button,
      pane: paneIndex == null ? null : paneIndex + 1,
      target: elementIdentity(event.target),
    });
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!isDiagnosticShortcut(event)) return;
    log('debug', 'ui.keyboard-shortcut', {
      key: event.key,
      code: event.code,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      alt: event.altKey,
      shift: event.shiftKey,
      target: elementIdentity(event.target),
      pane: paneIndexForElement(event.target) == null ? null : paneIndexForElement(event.target) + 1,
    });
    schedulePostInteractionCheck('keyboard');
  }, true);

  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => {
      log('info', 'mode.requested', { mode: button.dataset.mode, before: currentMode() });
      scheduleCheckpoints('mode-change');
    }, true);
  });

  document.querySelectorAll('.view-tabs').forEach((tabs) => {
    tabs.addEventListener('click', (event) => {
      const button = event.target.closest('.view-btn');
      if (!button) return;
      log('debug', 'view.requested', {
        pane: Number(tabs.dataset.pane) + 1,
        requestedView: button.dataset.view,
        beforeView: activeView(Number(tabs.dataset.pane)),
      });
      scheduleCheckpoints('view-change');
    }, true);
  });

  editors.forEach((editor, index) => {
    editor?.addEventListener('input', (event) => {
      const now = performance.now();
      if (now - lastEditLog[index] < 350) return;
      lastEditLog[index] = now;
      log('debug', 'editor.changed', {
        pane: index + 1,
        inputType: event.inputType || null,
        chars: editor.value.length,
        lines: countNewlinesFast(editor.value),
        selectionStart: editor.selectionStart,
        selectionEnd: editor.selectionEnd,
        selectionLength: Math.abs((editor.selectionEnd || 0) - (editor.selectionStart || 0)),
        scrollTop: round(editor.scrollTop),
        scrollLeft: round(editor.scrollLeft),
        compareVisible: isComparisonVisible(),
        mode: currentMode(),
        view: activeView(index),
      });
      schedulePostInteractionCheck('editor-input');
    });

    editor?.addEventListener('scroll', () => {
      const now = performance.now();
      if (now - lastScrollLog[index] < 700) return;
      lastScrollLog[index] = now;
      log('debug', 'editor.scrolled', captureScrollState(index));
    }, { passive: true });

    editor?.addEventListener('focus', () => log('debug', 'editor.focused', {
      pane: index + 1,
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
    }));

    editor?.addEventListener('blur', () => log('debug', 'editor.blurred', { pane: index + 1 }));
  });

  document.querySelectorAll('.tree-search').forEach((input) => {
    input.addEventListener('input', () => {
      const paneIndex = paneIndexForElement(input);
      log('debug', 'search.query-changed', {
        pane: paneIndex == null ? null : paneIndex + 1,
        queryLength: input.value.length,
        view: paneIndex == null ? null : activeView(paneIndex),
        mode: currentMode(),
      });
    });
  });

  for (const input of document.querySelectorAll('.file-input')) {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      log('info', 'file.selected', {
        pane: paneIndexForElement(input) == null ? null : paneIndexForElement(input) + 1,
        size: file?.size || 0,
        type: file?.type || '',
        extension: fileExtension(file?.name),
        lastModifiedAgeMs: file?.lastModified ? Math.max(0, Date.now() - file.lastModified) : null,
      });
      scheduleCheckpoints('file-selected');
    });
  }
}

function installLifecycleLogging() {
  addEventListener('resize', () => {
    resizeCount += 1;
    log('debug', 'window.resized', {
      count: resizeCount,
      viewport: captureViewport(),
    });
    schedulePostInteractionCheck('resize');
  }, { passive: true });

  addEventListener('online', () => log('info', 'network.changed', { online: true }));
  addEventListener('offline', () => log('warn', 'network.changed', { online: false }));

  document.addEventListener('visibilitychange', () => {
    log('debug', 'document.visibility-changed', {
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      snapshot: captureCompactSnapshot(),
    });
  });

  addEventListener('pagehide', (event) => {
    log('debug', 'session.pagehide', {
      persisted: event.persisted,
      uptimeMs: Math.round(performance.now() - startedAt),
      snapshot: captureCompactSnapshot(),
    });
    persistNow();
  });

  addEventListener('pageshow', (event) => {
    log('debug', 'session.pageshow', { persisted: event.persisted });
  });

  addEventListener('beforeunload', persistNow);
}

function installPerformanceLogging() {
  const nav = performance.getEntriesByType?.('navigation')?.[0];
  if (nav) {
    log('debug', 'performance.navigation', {
      type: nav.type,
      durationMs: round(nav.duration),
      domInteractiveMs: round(nav.domInteractive),
      domContentLoadedMs: round(nav.domContentLoadedEventEnd),
      loadEventMs: round(nav.loadEventEnd),
      transferSize: nav.transferSize || 0,
      decodedBodySize: nav.decodedBodySize || 0,
    });
  }

  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskCount += 1;
        longTaskTotalMs += entry.duration;
        log(entry.duration >= 250 ? 'warn' : 'debug', 'performance.long-task', {
          durationMs: round(entry.duration),
          startTimeMs: round(entry.startTime),
          count: longTaskCount,
          totalMs: round(longTaskTotalMs),
          snapshot: entry.duration >= 250 ? captureCompactSnapshot() : undefined,
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch (_) {}

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        layoutShiftScore += entry.value || 0;
        if ((entry.value || 0) < 0.02 && layoutShiftScore < 0.1) continue;
        log(layoutShiftScore >= 0.25 ? 'warn' : 'debug', 'performance.layout-shift', {
          value: round(entry.value, 4),
          cumulative: round(layoutShiftScore, 4),
          sources: Array.isArray(entry.sources) ? entry.sources.slice(0, 5).map((source) => ({
            node: elementIdentity(source.node),
            previousRect: rectSummary(source.previousRect),
            currentRect: rectSummary(source.currentRect),
          })) : [],
        });
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch (_) {}
}

function installStateObservers() {
  const customEvents = [
    'payloaddiff:live-compare-updated',
    'payloaddiff:syntax-issues-updated',
    'payloaddiff:view-surface-synced',
    'payloaddiff:fold-state-changed',
    'payloaddiff:comparison-reset',
    'payloaddiff:theme-changed',
    'payloaddiff:panel-name-changed',
    'payloaddiff:panel-names-restored',
    'payloaddiff:scrollbar-state-changed',
  ];

  for (const type of customEvents) {
    window.addEventListener(type, (event) => {
      log(type.includes('comparison-reset') ? 'info' : 'debug', `event.${type.replace('payloaddiff:', '')}`, {
        detail: summarizeCustomEvent(type, event.detail),
        snapshot: captureCompactSnapshot(),
      });
      schedulePostInteractionCheck(type);
    });
  }

  const observer = new MutationObserver((mutations) => {
    if (!mutations.some(isRelevantMutation)) return;
    if (mutationFrame) cancelAnimationFrame(mutationFrame);
    mutationFrame = requestAnimationFrame(() => {
      mutationFrame = 0;
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => {
        mutationTimer = 0;
        checkpoint('dom-state-changed', 'debug', { onlyIfChanged: true });
      }, 120);
    });
  });

  const targets = [document.body, compareBar, ...panes].filter(Boolean);
  for (const target of targets) {
    observer.observe(target, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'aria-hidden', 'aria-selected', 'data-active-view', 'data-theme'],
      childList: true,
    });
  }

  setInterval(() => {
    if (document.hidden) return;
    const anomalies = detectAnomalies();
    const signature = JSON.stringify(anomalies);
    if (anomalies.length && signature !== lastAnomalySignature) {
      lastAnomalySignature = signature;
      log('warn', 'ui.anomaly-detected', {
        anomalies,
        snapshot: captureSnapshot(),
      });
    } else if (!anomalies.length) {
      lastAnomalySignature = '';
    }
  }, 4000);
}

function markOperation(name) {
  const id = ++operationSequence;
  const started = performance.now();
  log('info', `${name}.click.started`, {
    operationId: id,
    snapshot: captureSnapshot(),
    anomalies: detectAnomalies(),
  });

  for (const delay of [0, 100, 1000, 3000]) {
    setTimeout(() => {
      const busy = document.body.classList.contains('busy');
      log(delay >= 3000 && busy ? 'warn' : 'debug', `${name}.click.checkpoint`, {
        operationId: id,
        delayMs: delay,
        elapsedMs: round(performance.now() - started),
        busy,
        snapshot: delay >= 1000 ? captureSnapshot() : captureCompactSnapshot(),
        anomalies: detectAnomalies(),
      });
    }, delay);
  }
}

function checkpoint(reason, level = 'debug', { onlyIfChanged = false } = {}) {
  const snapshot = captureSnapshot();
  const signature = JSON.stringify({
    mode: snapshot.mode,
    theme: snapshot.theme,
    busy: snapshot.busy,
    compareVisible: snapshot.compareVisible,
    diffPosition: snapshot.diffPosition,
    panes: snapshot.panes.map((pane) => ({
      activeView: pane.activeView,
      chars: pane.chars,
      lines: pane.lines,
      scroll: pane.scroll,
      syntaxCount: pane.syntax.count,
      scrollbar: pane.scrollbar,
    })),
  });
  if (onlyIfChanged && signature === lastSnapshotSignature) return;
  lastSnapshotSignature = signature;
  const anomalies = detectAnomalies();
  log(anomalies.length ? 'warn' : level, 'state.checkpoint', {
    reason,
    snapshot,
    anomalies,
  });
}

function scheduleCheckpoints(reason) {
  for (const delay of [0, 80, 350, 1200]) {
    setTimeout(() => checkpoint(`${reason}+${delay}ms`, 'debug', { onlyIfChanged: delay > 0 }), delay);
  }
}

function schedulePostInteractionCheck(reason) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const anomalies = detectAnomalies();
      if (!anomalies.length) return;
      const signature = JSON.stringify(anomalies);
      if (signature === lastAnomalySignature) return;
      lastAnomalySignature = signature;
      log('warn', 'ui.anomaly-after-interaction', {
        reason,
        anomalies,
        snapshot: captureSnapshot(),
      });
    });
  });
}

function captureSnapshot() {
  const compare = captureCompareState();
  return {
    uptimeMs: Math.round(performance.now() - startedAt),
    appVersion: APP_VERSION,
    diagnosticsSchemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    mode: currentMode(),
    theme: document.documentElement.dataset.theme || 'dark',
    bodyClasses: [...document.body.classList],
    busy: document.body.classList.contains('busy'),
    visibilityState: document.visibilityState,
    online: navigator.onLine,
    viewport: captureViewport(),
    focus: elementIdentity(document.activeElement),
    syncEnabled: document.querySelector('.enhancement-sync input[type="checkbox"]')?.checked ?? null,
    compareVisible: isComparisonVisible(),
    compare,
    status: document.querySelector('#statusText')?.textContent || '',
    statusClass: document.querySelector('#statusText')?.className || '',
    diffPosition: document.querySelector('#diffPosition')?.textContent || '',
    summary: document.querySelector('#compareSummary')?.textContent || '',
    controls: captureControls(),
    panes: editors.map((_, index) => capturePane(index)),
    performance: {
      longTaskCount,
      longTaskTotalMs: round(longTaskTotalMs),
      layoutShiftScore: round(layoutShiftScore, 4),
      jsHeap: captureMemory(),
    },
  };
}

function captureCompactSnapshot() {
  return {
    uptimeMs: Math.round(performance.now() - startedAt),
    mode: currentMode(),
    theme: document.documentElement.dataset.theme || 'dark',
    busy: document.body.classList.contains('busy'),
    compareVisible: isComparisonVisible(),
    diffPosition: document.querySelector('#diffPosition')?.textContent || '',
    views: panes.map((_, index) => activeView(index)),
    paneChars: editors.map((editor) => editor?.value.length || 0),
    paneLines: editors.map((editor) => countNewlinesFast(editor?.value || '')),
    syntaxIssueCounts: panes.map((_, index) => syntaxIssues(index).length),
    scrollTops: panes.map((_, index) => round(visibleScroller(index)?.scrollTop || 0)),
    scrollbars: panes.map((_, index) => scrollbarState(index)),
  };
}

function capturePane(index) {
  const pane = panes[index];
  const editor = editors[index];
  const scroller = visibleScroller(index);
  const search = pane?.querySelector('.tree-search');
  const issues = syntaxIssues(index);
  const panelHeading = pane?.querySelector('.pane-head h2, .pane-head h3, [contenteditable="true"]');
  const layers = {};
  for (const [name, selector] of Object.entries(layerSelectors())) {
    layers[name] = captureElementState(pane?.querySelector(selector));
  }

  return {
    pane: index + 1,
    activeView: activeView(index),
    datasetActiveView: pane?.dataset.activeView || null,
    chars: editor?.value.length || 0,
    lines: countNewlinesFast(editor?.value || ''),
    selection: editor ? {
      start: editor.selectionStart,
      end: editor.selectionEnd,
      length: Math.abs((editor.selectionEnd || 0) - (editor.selectionStart || 0)),
      direction: editor.selectionDirection || null,
    } : null,
    scroll: {
      top: round(scroller?.scrollTop || 0),
      left: round(scroller?.scrollLeft || 0),
      scrollHeight: round(scroller?.scrollHeight || 0),
      scrollWidth: round(scroller?.scrollWidth || 0),
      clientHeight: round(scroller?.clientHeight || 0),
      clientWidth: round(scroller?.clientWidth || 0),
    },
    scrollbar: scrollbarState(index),
    panelNameLength: panelHeading?.textContent?.trim().length || 0,
    search: {
      queryLength: search?.value.length || 0,
      placeholder: search?.placeholder || '',
      resultCount: parseCount(pane?.querySelector('.search-count')?.textContent),
    },
    syntax: {
      count: issues.length,
      first: issues.slice(0, 10).map((issue) => ({
        line: numberOrNull(issue.line),
        column: numberOrNull(issue.column),
        offset: numberOrNull(issue.offset),
        message: issue.message || issue.reason || '',
      })),
      badgeText: pane?.querySelector('.syntax-error-badge')?.textContent || '',
      railMarkers: pane?.querySelectorAll('.syntax-error-marker').length || 0,
    },
    folding: {
      foldButtons: pane?.querySelectorAll('.code-fold-toggle, .fold-row-toggle').length || 0,
      collapsedRows: pane?.querySelectorAll('.fold-code-row.collapsed').length || 0,
      foldViewRows: pane?.querySelectorAll('.fold-code-row').length || 0,
    },
    tree: {
      rowsRendered: pane?.querySelectorAll('.tree-row').length || 0,
      expandedRows: pane?.querySelectorAll('.tree-row.expanded, .tree-toggle.expanded').length || 0,
      selectedRows: pane?.querySelectorAll('.tree-row.selected, .tree-row.tree-diff-current, .tree-row.search-hit').length || 0,
    },
    layers,
  };
}

function scrollbarState(index) {
  try {
    const state = window.PayloadDiffScrollbars?.getPaneState?.(index);
    if (state && typeof state === 'object') return { ...state };
  } catch (_) {}
  const pane = panes[index];
  const rail = pane?.querySelector('.pd-scrollbar-rail');
  const thumb = pane?.querySelector('.pd-scrollbar-thumb');
  return {
    pane: index + 1,
    theme: document.documentElement.dataset.theme || 'dark',
    surface: activeView(index),
    visible: isVisible(rail),
    trackHeight: round(rail?.clientHeight || 0),
    thumbHeight: round(thumb?.offsetHeight || 0),
  };
}

function captureCompareState() {
  const session = window.PayloadDiffCompareSession;
  let result = null;
  try { result = session?.getResult?.() || null; } catch (_) {}
  return {
    sessionAvailable: !!session,
    active: safeCall(() => session?.isActive?.(), null),
    mode: safeCall(() => session?.getMode?.(), null),
    diffCount: safeCall(() => session?.getDiffCount?.(), null),
    currentDiffIndex: safeCall(() => session?.getCurrentDiffIndex?.(), null),
    invalidSides: safeCall(() => session?.getInvalidSides?.(), [])?.map?.((item) => ({
      side: item.side || null,
      line: numberOrNull(item.line),
      column: numberOrNull(item.column),
      message: item.message || '',
    })) || [],
    result: result ? {
      comparisonKind: result.comparisonKind || null,
      fallback: result.fallback === true,
      identical: result.identical === true,
      elapsedMs: round(result.elapsedMs || 0),
      diffCount: Array.isArray(result.diffs) ? result.diffs.length : 0,
      summary: result.summary ? {
        added: result.summary.added || 0,
        removed: result.summary.removed || 0,
        modified: result.summary.modified || 0,
        truncated: result.summary.truncated === true,
      } : null,
      lineMapSample: Array.isArray(result.diffs) ? result.diffs.slice(0, 20).map((diff) => ({
        type: diff.type,
        leftLine: numberOrNull(diff.leftLine),
        rightLine: numberOrNull(diff.rightLine),
      })) : [],
    } : null,
  };
}

function captureControls() {
  const ids = ['formatBtn', 'compareBtn', 'clearBtn', 'firstDiff', 'prevDiff', 'nextDiff', 'lastDiff', 'themeToggleBtn'];
  const out = {};
  for (const id of ids) {
    const element = document.querySelector(`#${id}`);
    if (!element) continue;
    out[id] = {
      disabled: !!element.disabled,
      hidden: !isVisible(element),
      active: element.classList.contains('active'),
      ariaPressed: element.getAttribute('aria-pressed'),
    };
  }
  return out;
}

function captureEnvironment() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform || '',
    mobile: navigator.userAgentData?.mobile ?? null,
    languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 5) : [],
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemoryGb: navigator.deviceMemory || null,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack || null,
    online: navigator.onLine,
    connection: connection ? {
      effectiveType: connection.effectiveType || null,
      downlinkMbps: connection.downlink || null,
      rttMs: connection.rtt || null,
      saveData: connection.saveData || false,
    } : null,
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
    },
    viewport: captureViewport(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    locale: Intl.DateTimeFormat().resolvedOptions().locale || '',
    reducedMotion: matchMediaSafe('(prefers-reduced-motion: reduce)'),
    forcedColors: matchMediaSafe('(forced-colors: active)'),
    colorSchemeDark: matchMediaSafe('(prefers-color-scheme: dark)'),
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
  };
}

function detectAnomalies() {
  const anomalies = [];
  for (let index = 0; index < panes.length; index += 1) {
    const pane = panes[index];
    const editor = editors[index];
    if (!pane || !editor) continue;
    const view = activeView(index);
    const editorState = captureElementState(editor);
    const treeState = captureElementState(pane.querySelector('.tree-view'));
    const foldState = captureElementState(pane.querySelector('.fold-code-view'));
    const alignedState = captureElementState(pane.querySelector('.aligned-compare-view'));
    const overlayState = captureElementState(pane.querySelector('.editor-diff-overlay'));
    const scroller = visibleScroller(index);
    const scrollbar = scrollbarState(index);
    const codeSurfaceVisible = editorState.visible || foldState.visible || alignedState.visible;

    // Code view can legitimately render through the folded/aligned projection
    // while the canonical textarea is hidden. Only warn when no code surface
    // is visible at all.
    if (view === 'code' && !codeSurfaceVisible) {
      anomalies.push({ code: 'CODE_SELECTED_EDITOR_HIDDEN', pane: index + 1 });
    }
    if (view === 'tree' && treeState.exists && !treeState.visible) {
      anomalies.push({ code: 'TREE_SELECTED_TREE_HIDDEN', pane: index + 1 });
    }
    if (view === 'tree' && editorState.visible) {
      anomalies.push({ code: 'TREE_SELECTED_EDITOR_VISIBLE', pane: index + 1 });
    }
    if (view === 'code' && treeState.visible) {
      anomalies.push({ code: 'CODE_SELECTED_TREE_VISIBLE', pane: index + 1 });
    }
    if (view === 'code' && overlayState.visible && editorState.visible) {
      const overlayZ = numericZ(overlayState.zIndex);
      const editorZ = numericZ(editorState.zIndex);
      if (overlayZ >= editorZ && overlayState.backgroundColor && !isTransparentColor(overlayState.backgroundColor)) {
        anomalies.push({
          code: 'OPAQUE_DIFF_OVERLAY_CAN_COVER_EDITOR',
          pane: index + 1,
          overlayZ,
          editorZ,
          overlayBackground: overlayState.backgroundColor,
        });
      }
    }
    if (editor.value.length > 0 && view === 'code' && editorState.visible && isTransparentColor(editorState.color)) {
      anomalies.push({ code: 'EDITOR_TEXT_TRANSPARENT', pane: index + 1 });
    }
    if (pane.classList.contains('tree-surface-active') && pane.classList.contains('code-surface-active')) {
      anomalies.push({ code: 'BOTH_SURFACES_ACTIVE', pane: index + 1 });
    }
    if (scroller && scroller.scrollHeight - scroller.clientHeight > 2 && scrollbar.visible === false) {
      anomalies.push({
        code: 'SCROLLABLE_SURFACE_WITHOUT_VISIBLE_SCROLLBAR',
        pane: index + 1,
        surface: scrollbar.surface,
        scrollHeight: round(scroller.scrollHeight),
        clientHeight: round(scroller.clientHeight),
        theme: scrollbar.theme,
      });
    }
    if (scrollbar.visible && scrollbar.trackHeight > 0 && scrollbar.thumbHeight <= 0) {
      anomalies.push({ code: 'VISIBLE_SCROLLBAR_WITHOUT_THUMB', pane: index + 1, surface: scrollbar.surface });
    }
  }

  const session = window.PayloadDiffCompareSession;
  if (isComparisonVisible() && session && safeCall(() => session.isActive(), false) === false) {
    anomalies.push({ code: 'COMPARE_BAR_VISIBLE_SESSION_INACTIVE' });
  }
  return anomalies;
}

function captureElementState(element) {
  if (!element) return { exists: false, visible: false };
  let style = null;
  try { style = getComputedStyle(element); } catch (_) {}
  const rect = rectSummary(element.getBoundingClientRect?.());
  return {
    exists: true,
    visible: isVisible(element),
    hiddenClass: element.classList.contains('hidden'),
    classes: [...element.classList].slice(0, 20),
    display: style?.display || '',
    visibility: style?.visibility || '',
    opacity: style?.opacity || '',
    position: style?.position || '',
    zIndex: style?.zIndex || '',
    pointerEvents: style?.pointerEvents || '',
    color: style?.color || '',
    backgroundColor: style?.backgroundColor || '',
    overflowX: style?.overflowX || '',
    overflowY: style?.overflowY || '',
    fontSize: style?.fontSize || '',
    lineHeight: style?.lineHeight || '',
    rect,
    childCount: element.childElementCount || 0,
  };
}

function layerSelectors() {
  return {
    editor: '.editor',
    tree: '.tree-view',
    foldView: '.fold-code-view',
    diffOverlay: '.editor-diff-overlay',
    inlineDiff: '.inline-diff-layer',
    lineGutter: '.editor-line-gutter',
    indentGuides: '.editor-indent-guides',
    foldGutter: '.code-fold-gutter',
    syntaxLines: '.syntax-line-layer',
    syntaxRail: '.syntax-error-rail',
    scrollbarRail: '.pd-scrollbar-rail',
    scrollbarThumb: '.pd-scrollbar-thumb',
  };
}

function summarizeCustomEvent(type, detail) {
  const source = detail && typeof detail === 'object' ? detail : {};
  if (type === 'payloaddiff:live-compare-updated') {
    const diffs = Array.isArray(source.diffs) ? source.diffs : [];
    return {
      mode: source.mode || null,
      diffCount: diffs.length,
      currentDiffIndex: numberOrNull(source.currentDiffIndex),
      summary: source.summary ? {
        added: source.summary.added || 0,
        removed: source.summary.removed || 0,
        modified: source.summary.modified || 0,
        truncated: source.summary.truncated === true,
      } : null,
      comparisonKind: source.comparisonKind || null,
      fallback: source.fallback === true || diffs.some((diff) => String(diff?.path || '').startsWith('$text[')),
      lineMapSample: diffs.slice(0, 20).map((diff) => ({
        type: diff.type,
        leftLine: numberOrNull(diff.leftLine),
        rightLine: numberOrNull(diff.rightLine),
      })),
    };
  }
  if (type === 'payloaddiff:syntax-issues-updated') {
    return {
      paneIndex: numberOrNull(source.paneIndex),
      issueCount: Array.isArray(source.issues) ? source.issues.length : numberOrNull(source.count),
    };
  }
  if (type === 'payloaddiff:scrollbar-state-changed') {
    return {
      pane: numberOrNull(source.pane),
      theme: source.theme || null,
      surface: source.surface || null,
      visible: source.visible === true,
      scrollTop: numberOrNull(source.scrollTop),
      maxScroll: numberOrNull(source.maxScroll),
      scrollHeight: numberOrNull(source.scrollHeight),
      clientHeight: numberOrNull(source.clientHeight),
      trackHeight: numberOrNull(source.trackHeight),
      thumbHeight: numberOrNull(source.thumbHeight),
      thumbTop: numberOrNull(source.thumbTop),
      progress: typeof source.progress === 'number' ? source.progress : null,
    };
  }
  if (type === 'payloaddiff:panel-name-changed' || type === 'payloaddiff:panel-names-restored') {
    return {
      paneIndex: numberOrNull(source.paneIndex),
      nameLengths: Array.isArray(source.names) ? source.names.map((name) => String(name || '').length) : undefined,
    };
  }
  return sanitizeDiagnosticValue(source);
}

function describeControl(element) {
  const paneIndex = paneIndexForElement(element);
  return {
    control: elementIdentity(element),
    pane: paneIndex == null ? null : paneIndex + 1,
    disabled: !!element.disabled,
    checked: typeof element.checked === 'boolean' ? element.checked : undefined,
    active: element.classList.contains('active'),
    view: element.dataset?.view || null,
    mode: element.dataset?.mode || null,
    action: inferControlAction(element),
    before: captureCompactSnapshot(),
  };
}

function inferControlAction(element) {
  const id = element.id || '';
  const classes = [...element.classList];
  if (id) return id;
  if (classes.includes('paste-btn')) return 'paste';
  if (classes.includes('upload-btn')) return 'upload';
  if (classes.includes('copy-btn')) return 'copy';
  if (classes.includes('search-btn')) return 'search';
  if (classes.includes('view-btn')) return `view-${element.dataset.view || 'unknown'}`;
  if (classes.includes('mode-btn')) return `mode-${element.dataset.mode || 'unknown'}`;
  if (classes.includes('code-fold-toggle') || classes.includes('fold-row-toggle')) return 'fold-toggle';
  if (classes.includes('pd-scrollbar-rail')) return 'scrollbar-track';
  if (classes.includes('pd-scrollbar-thumb')) return 'scrollbar-thumb';
  return element.tagName?.toLowerCase() || 'unknown';
}

function captureScrollState(index) {
  const editor = editors[index];
  return {
    pane: index + 1,
    view: activeView(index),
    top: round(editor?.scrollTop || 0),
    left: round(editor?.scrollLeft || 0),
    scrollHeight: round(editor?.scrollHeight || 0),
    scrollWidth: round(editor?.scrollWidth || 0),
    clientHeight: round(editor?.clientHeight || 0),
    clientWidth: round(editor?.clientWidth || 0),
    verticalProgress: ratio(editor?.scrollTop || 0, Math.max(1, (editor?.scrollHeight || 0) - (editor?.clientHeight || 0))),
    horizontalProgress: ratio(editor?.scrollLeft || 0, Math.max(1, (editor?.scrollWidth || 0) - (editor?.clientWidth || 0))),
    scrollbar: scrollbarState(index),
  };
}

function syntaxIssues(index) {
  try {
    const issues = window.PayloadDiffSyntaxIssues?.getIssues?.(index);
    return Array.isArray(issues) ? issues : [];
  } catch {
    return [];
  }
}

function activeView(index) {
  const pane = panes[index];
  if (!pane) return null;
  if (pane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active')) return 'tree';
  return 'code';
}

function currentMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode || null;
}

function isComparisonVisible() {
  return !!compareBar && !compareBar.classList.contains('hidden') && compareBar.offsetParent !== null;
}

function visibleScroller(index) {
  const pane = panes[index];
  if (!pane) return null;
  return [
    pane.querySelector('.aligned-compare-view'),
    pane.querySelector('.tree-view'),
    pane.querySelector('.fold-code-view'),
    pane.querySelector('.editor'),
  ].find(isVisible) || null;
}

function isVisible(element) {
  if (!element || element.classList?.contains('hidden') || element.offsetParent === null) return false;
  try {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
  } catch {
    return true;
  }
}

function log(level, type, data = {}) {
  const event = createDiagnosticEvent({ level, type, data: sanitizeDiagnosticValue(data) });
  event.sessionId = SESSION_ID;
  event.uptimeMs = Math.round(performance.now() - startedAt);
  events.push(event);
  events = trimDiagnosticEvents(events, MAX_DIAGNOSTIC_EVENTS);
  schedulePersist();

  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug';
  try { console[method](`[PayloadDiff:${type}]`, event.data); } catch (_) {}
  return event;
}

function exportDiagnostics() {
  const currentSnapshot = captureSnapshot();
  const anomalies = detectAnomalies();
  const report = {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    privacy: 'Payload bodies, clipboard text, search text, selected text, and panel-name text are intentionally excluded. Diagnostics contain metadata, counts, positions, UI state, computed styles, errors, timings, and anonymized structural state only.',
    currentSessionId: SESSION_ID,
    environment: captureEnvironment(),
    currentSnapshot,
    currentAnomalies: anomalies,
    eventSummary: summarizeDiagnosticEvents(events),
    events: [...events],
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `payloaddiff-diagnostics-v${DIAGNOSTICS_SCHEMA_VERSION}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function clearDiagnostics() {
  events = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (_) {}
  lastAnomalySignature = '';
  lastSnapshotSignature = '';
  log('info', 'diagnostics.cleared', { snapshot: captureCompactSnapshot() });
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = 0;
    persistNow();
  }, 800);
}

function persistNow() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimDiagnosticEvents(events)));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimDiagnosticEvents(events, 400)));
    } catch (_) {}
  }
}

function loadEvents() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(stored)) return trimDiagnosticEvents(stored);
  } catch (_) {}
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
    if (Array.isArray(legacy)) return trimDiagnosticEvents(legacy);
  } catch (_) {}
  return [];
}

function isRelevantMutation(mutation) {
  const element = mutation.target?.nodeType === 1 ? mutation.target : mutation.target?.parentElement;
  if (!element) return false;
  if (element.closest?.('.editor-line-gutter-rows, .editor-indent-guides, .syntax-line-layer, .syntax-error-rail, .pd-scrollbar-rail')) return false;
  return true;
}

function paneIndexForElement(element) {
  const pane = element?.closest?.('.pane');
  if (!pane) return null;
  const index = panes.indexOf(pane);
  return index >= 0 ? index : null;
}

function elementIdentity(element) {
  if (!element || element.nodeType !== 1) return null;
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: [...element.classList].slice(0, 8),
    role: element.getAttribute('role'),
    dataView: element.dataset?.view || null,
    dataMode: element.dataset?.mode || null,
  };
}

function fileNameOnly(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value, location.href);
    return parsed.pathname.split('/').pop() || '';
  } catch {
    return String(value).split('/').pop() || '';
  }
}

function safeHost(value) {
  if (!value) return '';
  try { return new URL(value, location.href).host; } catch { return ''; }
}

function fileExtension(name) {
  const match = String(name || '').toLowerCase().match(/(\.[a-z0-9]{1,8})$/);
  return match?.[1] || '';
}

function isDiagnosticShortcut(event) {
  if (!(event.ctrlKey || event.metaKey || event.altKey)) return false;
  const key = String(event.key || '').toLowerCase();
  return ['f', 'g', 'enter', 'escape', 'arrowup', 'arrowdown', 'home', 'end', 'pageup', 'pagedown'].includes(key);
}

function parseCount(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeCall(callback, fallback) {
  try {
    const value = callback();
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function numericZ(value) {
  if (value === 'auto' || value == null || value === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isTransparentColor(value) {
  const text = String(value || '').replace(/\s+/g, '').toLowerCase();
  return !text || text === 'transparent' || text === 'rgba(0,0,0,0)' || text.endsWith(',0)');
}

function ratio(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, value / total)) * 1000) / 1000;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function rectSummary(rect) {
  if (!rect) return null;
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
    top: round(rect.top),
    right: round(rect.right),
    bottom: round(rect.bottom),
    left: round(rect.left),
  };
}

function captureViewport() {
  const vv = window.visualViewport;
  return {
    width: round(innerWidth),
    height: round(innerHeight),
    dpr: devicePixelRatio || 1,
    scrollX: round(scrollX),
    scrollY: round(scrollY),
    visualViewport: vv ? {
      width: round(vv.width),
      height: round(vv.height),
      offsetLeft: round(vv.offsetLeft),
      offsetTop: round(vv.offsetTop),
      scale: round(vv.scale, 3),
    } : null,
  };
}

function captureMemory() {
  const memory = performance.memory;
  if (!memory) return null;
  return {
    usedJsHeapSize: memory.usedJSHeapSize,
    totalJsHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  };
}

function matchMediaSafe(query) {
  try { return matchMedia(query).matches; } catch { return false; }
}
