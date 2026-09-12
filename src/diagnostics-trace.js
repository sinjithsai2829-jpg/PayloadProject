const diagnostics = window.PayloadDiffDiagnostics;
const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const ACTION_SETTLE_DELAYS = [0, 50, 250, 1000, 3000, 8000];
const READ_ONLY_ACTIONS = new Set([
  'compare', 'copy', 'search', 'search-prev', 'search-next', 'view-code', 'view-tree',
  'wrap', 'theme', 'mode-json', 'mode-xml', 'first-diff', 'prev-diff', 'next-diff',
  'last-diff', 'compare-options', 'compare-option', 'scrollbar-track', 'scrollbar-thumb',
  'tree-toggle', 'fold-toggle', 'download-comparison', 'open-compare-options',
]);

let actionSequence = 0;
let currentAction = null;
let lastRaf = performance.now();
let lastIntervalTick = performance.now();
let mutationSequence = 0;
const recentActions = [];

if (diagnostics?.log) {
  installActionTracing();
  installMutationTracing();
  installStallTracing();
  installExportSnapshot();
  installCustomEventTracing();
  diagnostics.log('info', 'trace.ready', {
    version: 1,
    capabilities: [
      'correlated-actions',
      'payload-fingerprints',
      'read-only-mutation-detection',
      'dom-mutation-summary',
      'surface-stack',
      'occlusion-probes',
      'event-loop-stalls',
      'animation-frame-stalls',
      'interaction-to-paint',
      'feature-state',
    ],
  });
}

window.PayloadDiffDiagnosticTrace = {
  snapshot: captureTraceSnapshot,
  fingerprints: capturePayloadFingerprints,
  currentAction: () => currentAction ? publicAction(currentAction) : null,
  recentActions: () => recentActions.slice(-30),
};

function installActionTracing() {
  document.addEventListener('click', (event) => {
    const control = event.target?.closest?.('button, .upload-btn, input[type="checkbox"], .tree-row, .code-fold-toggle, .fold-row-toggle, .pd-scrollbar-rail, .pd-scrollbar-thumb');
    if (!control) return;
    const action = inferAction(control);
    beginAction(action, control, event);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') beginAction('escape', event.target, event);
    else if ((event.metaKey || event.ctrlKey) && ['f', 'v', 'c'].includes(String(event.key).toLowerCase())) {
      beginAction(`shortcut-${String(event.key).toLowerCase()}`, event.target, event);
    }
  }, true);
}

function beginAction(name, control, sourceEvent) {
  const now = performance.now();
  const id = ++actionSequence;
  const before = captureTraceSnapshot();
  const action = {
    id,
    name,
    startedAt: now,
    before,
    mutations: createMutationSummary(),
    control: describeControl(control),
    source: sourceEvent?.type || null,
    readOnly: READ_ONLY_ACTIONS.has(name),
    settled: false,
  };
  currentAction = action;
  recentActions.push({ id, name, startedAtMs: Math.round(now), readOnly: action.readOnly });
  if (recentActions.length > 60) recentActions.splice(0, recentActions.length - 60);

  diagnostics.log('info', 'trace.action-started', {
    actionId: id,
    action: name,
    readOnly: action.readOnly,
    control: action.control,
    before,
  });

  const paintStart = performance.now();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const latency = performance.now() - paintStart;
    diagnostics.log(latency > 180 ? 'warn' : 'debug', 'trace.interaction-to-paint', {
      actionId: id,
      action: name,
      latencyMs: round(latency),
      currentSurface: captureSurfaceSummary(),
    });
  }));

  for (const delay of ACTION_SETTLE_DELAYS) {
    setTimeout(() => actionCheckpoint(action, delay), delay);
  }
}

function actionCheckpoint(action, delay) {
  if (!action) return;
  const after = captureTraceSnapshot();
  const payloadChanges = compareFingerprints(action.before.payloads, after.payloads);
  const stateChanges = diffTraceState(action.before, after);
  const anomalies = [];

  if (action.readOnly && payloadChanges.length) {
    anomalies.push({
      code: 'READ_ONLY_ACTION_CHANGED_PAYLOAD',
      action: action.name,
      actionId: action.id,
      changes: payloadChanges,
    });
  }

  anomalies.push(...detectTraceAnomalies(after));
  const level = anomalies.length ? 'warn' : 'debug';
  diagnostics.log(level, 'trace.action-checkpoint', {
    actionId: action.id,
    action: action.name,
    delayMs: delay,
    elapsedMs: round(performance.now() - action.startedAt),
    payloadChanges,
    stateChanges,
    mutations: action.mutations,
    anomalies,
    after: delay >= 250 ? after : compactTraceSnapshot(after),
  });

  if (delay === ACTION_SETTLE_DELAYS[ACTION_SETTLE_DELAYS.length - 1]) {
    action.settled = true;
    diagnostics.log(anomalies.length ? 'warn' : 'info', 'trace.action-settled', {
      actionId: action.id,
      action: action.name,
      durationMs: round(performance.now() - action.startedAt),
      readOnly: action.readOnly,
      payloadChanges,
      mutations: action.mutations,
      finalState: compactTraceSnapshot(after),
      anomalies,
    });
    if (currentAction?.id === action.id) currentAction = null;
  }
}

function installMutationTracing() {
  const observer = new MutationObserver((mutations) => {
    mutationSequence += mutations.length;
    const action = currentAction;
    if (!action || action.settled) return;

    for (const mutation of mutations) {
      action.mutations.total += 1;
      if (mutation.type === 'attributes') {
        action.mutations.attributes += 1;
        const key = mutation.attributeName || 'unknown';
        action.mutations.attributeNames[key] = (action.mutations.attributeNames[key] || 0) + 1;
        addTouchedNode(action.mutations, mutation.target);
      } else if (mutation.type === 'childList') {
        action.mutations.childList += 1;
        action.mutations.addedNodes += mutation.addedNodes?.length || 0;
        action.mutations.removedNodes += mutation.removedNodes?.length || 0;
        addTouchedNode(action.mutations, mutation.target);
      }
    }
  });

  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'hidden', 'aria-hidden', 'aria-selected', 'aria-pressed', 'data-theme', 'data-active-view'],
    childList: true,
  });
}

function installStallTracing() {
  setInterval(() => {
    const now = performance.now();
    const drift = now - lastIntervalTick - 1000;
    lastIntervalTick = now;
    if (document.hidden || drift < 180) return;
    diagnostics.log(drift >= 600 ? 'warn' : 'debug', 'performance.event-loop-stall', {
      driftMs: round(drift),
      action: currentAction ? publicAction(currentAction) : null,
      snapshot: drift >= 600 ? compactTraceSnapshot(captureTraceSnapshot()) : undefined,
    });
  }, 1000);

  const frame = (now) => {
    const gap = now - lastRaf;
    lastRaf = now;
    if (!document.hidden && gap >= 350) {
      diagnostics.log(gap >= 1000 ? 'warn' : 'debug', 'performance.frame-stall', {
        gapMs: round(gap),
        action: currentAction ? publicAction(currentAction) : null,
      });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function installExportSnapshot() {
  document.addEventListener('click', (event) => {
    if (!event.target?.closest?.('.diagnostics-export')) return;
    diagnostics.log('info', 'trace.export-snapshot', {
      currentAction: currentAction ? publicAction(currentAction) : null,
      recentActions: recentActions.slice(-30),
      mutationSequence,
      snapshot: captureTraceSnapshot(),
      anomalies: detectTraceAnomalies(captureTraceSnapshot()),
    });
  }, true);
}

function installCustomEventTracing() {
  const events = [
    'payloaddiff:live-compare-updated',
    'payloaddiff:comparison-reset',
    'payloaddiff:view-surface-synced',
    'payloaddiff:word-wrap-changed',
    'payloaddiff:word-wrap-layout',
    'payloaddiff:smart-wrap-layout',
    'payloaddiff:scrollbar-state-changed',
    'payloaddiff:syntax-issues-updated',
    'payloaddiff:fold-state-changed',
    'payloaddiff:theme-changed',
  ];
  for (const type of events) {
    window.addEventListener(type, () => {
      diagnostics.log('debug', 'trace.feature-event', {
        event: type.replace('payloaddiff:', ''),
        actionId: currentAction?.id || null,
        state: compactTraceSnapshot(captureTraceSnapshot()),
      });
    });
  }
}

function captureTraceSnapshot() {
  return {
    atMs: Math.round(performance.now()),
    mode: document.querySelector('.mode-btn.active')?.dataset.mode || null,
    theme: document.documentElement.dataset.theme || 'dark',
    busy: document.body.classList.contains('busy'),
    status: summarizeStatus(),
    payloads: capturePayloadFingerprints(),
    panes: panes.map((_, index) => capturePaneTrace(index)),
    compare: captureCompareTrace(),
    features: captureFeatureState(),
    focus: elementIdentity(document.activeElement),
    memory: captureMemory(),
    viewport: {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio || 1,
    },
  };
}

function compactTraceSnapshot(snapshot) {
  return {
    atMs: snapshot.atMs,
    mode: snapshot.mode,
    theme: snapshot.theme,
    busy: snapshot.busy,
    status: snapshot.status,
    payloads: snapshot.payloads,
    panes: snapshot.panes.map((pane) => ({
      pane: pane.pane,
      view: pane.view,
      activeSurface: pane.activeSurface,
      scroll: pane.scroll,
      layersVisible: pane.layers.filter((layer) => layer.visible).map((layer) => layer.name),
      occlusion: pane.occlusion,
    })),
    compare: snapshot.compare,
    features: snapshot.features,
  };
}

function capturePayloadFingerprints() {
  return editors.map((editor, index) => fingerprintText(editor?.value || '', index));
}

function fingerprintText(text, index) {
  const value = String(text || '');
  let lines = value.length ? 1 : 0;
  let maxLineLength = 0;
  let currentLineLength = 0;
  let longLines = 0;
  const threshold = 120;

  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 10) {
      lines += 1;
      if (currentLineLength > maxLineLength) maxLineLength = currentLineLength;
      if (currentLineLength > threshold) longLines += 1;
      currentLineLength = 0;
    } else currentLineLength += 1;
  }
  if (currentLineLength > maxLineLength) maxLineLength = currentLineLength;
  if (currentLineLength > threshold) longLines += 1;

  return {
    pane: index + 1,
    chars: value.length,
    lines,
    sampleHash: sampledHash(value),
    maxLineLength,
    longLinesOver120: longLines,
    selectionStart: editors[index]?.selectionStart ?? null,
    selectionEnd: editors[index]?.selectionEnd ?? null,
  };
}

function sampledHash(text) {
  const value = String(text || '');
  if (!value) return '0';
  let hash = 2166136261;
  const sampleCount = Math.min(4096, value.length);
  const step = Math.max(1, Math.floor(value.length / sampleCount));
  for (let index = 0; index < value.length; index += step) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= value.length;
  hash = Math.imul(hash, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function capturePaneTrace(index) {
  const pane = panes[index];
  const view = pane?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active') ? 'tree' : 'code';
  const layers = captureLayers(index);
  const activeLayer = layers.find((layer) => layer.visible && ['smartWrap', 'aligned', 'tree', 'fold', 'editor'].includes(layer.name));
  const scroller = activeScroller(index);
  return {
    pane: index + 1,
    view,
    activeSurface: activeLayer?.name || null,
    layers,
    scroll: scroller ? {
      top: round(scroller.scrollTop),
      left: round(scroller.scrollLeft),
      maxTop: round(Math.max(0, scroller.scrollHeight - scroller.clientHeight)),
      maxLeft: round(Math.max(0, scroller.scrollWidth - scroller.clientWidth)),
      clientHeight: round(scroller.clientHeight),
      clientWidth: round(scroller.clientWidth),
      scrollHeight: round(scroller.scrollHeight),
      scrollWidth: round(scroller.scrollWidth),
    } : null,
    scrollbar: safeCall(() => window.PayloadDiffScrollbars?.getPaneState?.(index), null),
    smartWrap: safeCall(() => window.PayloadDiffSmartWrap?.getState?.(index), null),
    occlusion: captureOcclusion(index),
  };
}

function captureLayers(index) {
  const pane = panes[index];
  const selectors = {
    smartWrap: '.smart-wrap-view',
    aligned: '.aligned-compare-view',
    tree: '.tree-view',
    fold: '.fold-code-view',
    editor: '.editor',
    diffOverlay: '.editor-diff-overlay',
    inlineDiff: '.inline-diff-layer',
    wrapDiff: '.wrap-diff-layer',
    syntax: '.syntax-line-layer',
    syntaxRail: '.syntax-error-rail',
    lineGutter: '.editor-line-gutter',
    indentGuides: '.editor-indent-guides',
    foldGutter: '.code-fold-gutter',
    scrollbar: '.pd-scrollbar-rail',
  };
  return Object.entries(selectors).map(([name, selector]) => layerState(name, pane?.querySelector(selector)));
}

function layerState(name, element) {
  if (!element) return { name, exists: false, visible: false };
  let style = null;
  try { style = getComputedStyle(element); } catch (_) {}
  const rect = element.getBoundingClientRect?.();
  const visible = !!rect && rect.width > 0 && rect.height > 0
    && style?.display !== 'none' && style?.visibility !== 'hidden'
    && Number(style?.opacity || 1) !== 0 && !element.classList.contains('hidden');
  return {
    name,
    exists: true,
    visible,
    zIndex: style?.zIndex || '',
    opacity: style?.opacity || '',
    pointerEvents: style?.pointerEvents || '',
    display: style?.display || '',
    visibility: style?.visibility || '',
    background: style?.backgroundColor || '',
    color: style?.color || '',
    rect: rect ? {
      x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height),
    } : null,
  };
}

function captureOcclusion(index) {
  const pane = panes[index];
  const wrap = pane?.querySelector('.editor-wrap');
  const rect = wrap?.getBoundingClientRect?.();
  if (!rect || rect.width < 10 || rect.height < 10) return [];
  const points = [
    ['center', rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
    ['upper', rect.left + rect.width * 0.5, rect.top + Math.min(80, rect.height * 0.2)],
    ['content-left', rect.left + Math.min(140, rect.width * 0.2), rect.top + Math.min(120, rect.height * 0.3)],
  ];
  return points.map(([point, x, y]) => ({
    point,
    topElements: document.elementsFromPoint(x, y).slice(0, 6).map(elementIdentity),
  }));
}

function captureCompareTrace() {
  const session = window.PayloadDiffCompareSession;
  const result = safeCall(() => session?.getResult?.(), null);
  return {
    active: safeCall(() => session?.isActive?.(), false),
    mode: safeCall(() => session?.getMode?.(), null),
    currentDiffIndex: safeCall(() => session?.getCurrentDiffIndex?.(), null),
    diffCount: Array.isArray(result?.diffs) ? result.diffs.length : safeCall(() => session?.getDiffCount?.(), null),
    comparisonKind: result?.comparisonKind || null,
    fallback: result?.fallback === true,
    identical: result?.identical === true,
    summary: result?.summary ? {
      added: result.summary.added || 0,
      removed: result.summary.removed || 0,
      modified: result.summary.modified || 0,
      truncated: result.summary.truncated === true,
    } : null,
    alignedActive: safeCall(() => window.PayloadDiffAlignedCompare?.isActive?.(), false),
    placeholders: safeCall(() => window.PayloadDiffAlignedCompare?.getPlaceholderCount?.(), 0),
  };
}

function captureFeatureState() {
  return {
    sync: document.querySelector('.enhancement-sync input[type="checkbox"]')?.checked ?? null,
    wrap: editors.map((_, index) => safeCall(() => window.PayloadDiffWordWrap?.isEnabled?.(index), false)),
    smartWrap: editors.map((_, index) => safeCall(() => window.PayloadDiffSmartWrap?.getState?.(index), null)),
    compareOptionsOpen: isVisible(document.querySelector('.compare-options-menu, .compare-options-popover, .compare-options-panel')),
    compareOptions: [...document.querySelectorAll('.compare-options-menu input[type="checkbox"], .compare-options-panel input[type="checkbox"]')].map((input) => ({
      checked: input.checked,
      disabled: input.disabled,
      id: input.id || null,
    })),
    treeRows: panes.map((pane) => pane?.querySelectorAll('.tree-row').length || 0),
    foldRows: panes.map((pane) => pane?.querySelectorAll('.fold-code-row').length || 0),
    syntaxCounts: panes.map((_, index) => safeCall(() => window.PayloadDiffSyntaxIssues?.getIssues?.(index)?.length, 0)),
  };
}

function detectTraceAnomalies(snapshot) {
  const anomalies = [];
  for (const pane of snapshot.panes) {
    const visibleSurfaces = pane.layers.filter((layer) => layer.visible && ['smartWrap', 'aligned', 'tree', 'fold', 'editor'].includes(layer.name));
    if (pane.view === 'tree' && !visibleSurfaces.some((layer) => layer.name === 'tree')) {
      anomalies.push({ code: 'TRACE_TREE_SELECTED_WITHOUT_TREE_SURFACE', pane: pane.pane, visible: visibleSurfaces.map((layer) => layer.name) });
    }
    if (pane.view === 'code' && !visibleSurfaces.some((layer) => ['smartWrap', 'aligned', 'fold', 'editor'].includes(layer.name))) {
      anomalies.push({ code: 'TRACE_CODE_SELECTED_WITHOUT_CODE_SURFACE', pane: pane.pane });
    }
    const scrollbar = pane.scrollbar;
    if (pane.scroll?.maxTop > 2 && scrollbar && scrollbar.visible === false) {
      anomalies.push({ code: 'TRACE_SCROLLABLE_WITHOUT_SCROLLBAR', pane: pane.pane, surface: pane.activeSurface });
    }
    const topAtCenter = pane.occlusion.find((probe) => probe.point === 'center')?.topElements?.[0] || '';
    if (pane.activeSurface && topAtCenter && !topAtCenter.includes(surfaceClassHint(pane.activeSurface)) && !topAtCenter.includes('pd-scrollbar')) {
      anomalies.push({ code: 'TRACE_ACTIVE_SURFACE_OCCLUDED', pane: pane.pane, surface: pane.activeSurface, topElement: topAtCenter });
    }
  }
  return anomalies;
}

function compareFingerprints(before = [], after = []) {
  const changes = [];
  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    const a = before[index] || {};
    const b = after[index] || {};
    if (a.chars !== b.chars || a.lines !== b.lines || a.sampleHash !== b.sampleHash) {
      changes.push({
        pane: index + 1,
        before: { chars: a.chars || 0, lines: a.lines || 0, sampleHash: a.sampleHash || null },
        after: { chars: b.chars || 0, lines: b.lines || 0, sampleHash: b.sampleHash || null },
      });
    }
  }
  return changes;
}

function diffTraceState(before, after) {
  const changes = [];
  if (before.mode !== after.mode) changes.push({ field: 'mode', before: before.mode, after: after.mode });
  if (before.theme !== after.theme) changes.push({ field: 'theme', before: before.theme, after: after.theme });
  if (before.busy !== after.busy) changes.push({ field: 'busy', before: before.busy, after: after.busy });
  for (let index = 0; index < before.panes.length; index += 1) {
    const a = before.panes[index];
    const b = after.panes[index];
    if (a.view !== b.view) changes.push({ field: `pane${index + 1}.view`, before: a.view, after: b.view });
    if (a.activeSurface !== b.activeSurface) changes.push({ field: `pane${index + 1}.surface`, before: a.activeSurface, after: b.activeSurface });
  }
  if (before.compare?.diffCount !== after.compare?.diffCount) changes.push({ field: 'compare.diffCount', before: before.compare?.diffCount, after: after.compare?.diffCount });
  if (before.compare?.currentDiffIndex !== after.compare?.currentDiffIndex) changes.push({ field: 'compare.currentDiffIndex', before: before.compare?.currentDiffIndex, after: after.compare?.currentDiffIndex });
  return changes.slice(0, 40);
}

function inferAction(element) {
  const id = element?.id || '';
  if (id === 'compareBtn') return 'compare';
  if (id === 'formatBtn') return 'format';
  if (id === 'clearBtn') return 'clear-both';
  if (id === 'firstDiff') return 'first-diff';
  if (id === 'prevDiff') return 'prev-diff';
  if (id === 'nextDiff') return 'next-diff';
  if (id === 'lastDiff') return 'last-diff';
  if (id === 'themeToggleBtn') return 'theme';
  if (id === 'downloadComparisonBtn') return 'download-comparison';
  const classes = element ? [...element.classList] : [];
  if (classes.includes('paste-btn')) return 'paste';
  if (classes.includes('copy-btn')) return 'copy';
  if (classes.includes('upload-btn')) return 'upload';
  if (classes.includes('search-run')) return 'search';
  if (classes.includes('search-prev')) return 'search-prev';
  if (classes.includes('search-next')) return 'search-next';
  if (classes.includes('word-wrap-toggle')) return 'wrap';
  if (classes.includes('mode-btn')) return `mode-${element.dataset.mode || 'unknown'}`;
  if (classes.includes('view-btn')) return `view-${element.dataset.view || 'unknown'}`;
  if (classes.includes('code-fold-toggle') || classes.includes('fold-row-toggle')) return 'fold-toggle';
  if (classes.includes('tree-toggle')) return 'tree-toggle';
  if (classes.includes('pd-scrollbar-thumb')) return 'scrollbar-thumb';
  if (classes.includes('pd-scrollbar-rail')) return 'scrollbar-track';
  if (element?.matches?.('.compare-options-menu input, .compare-options-panel input')) return 'compare-option';
  if (classes.some((name) => name.includes('compare-options'))) return 'compare-options';
  return id || element?.tagName?.toLowerCase() || 'unknown';
}

function describeControl(element) {
  const pane = element?.closest?.('.pane');
  return {
    action: inferAction(element),
    identity: elementIdentity(element),
    pane: pane ? panes.indexOf(pane) + 1 : null,
    disabled: !!element?.disabled,
    checked: typeof element?.checked === 'boolean' ? element.checked : undefined,
    ariaPressed: element?.getAttribute?.('aria-pressed') || null,
  };
}

function activeScroller(index) {
  const pane = panes[index];
  if (!pane) return null;
  for (const selector of ['.smart-wrap-view', '.aligned-compare-view', '.tree-view', '.fold-code-view', '.editor']) {
    const element = pane.querySelector(selector);
    if (isVisible(element)) return element;
  }
  return null;
}

function summarizeStatus() {
  const element = document.querySelector('#statusText');
  return {
    length: element?.textContent?.length || 0,
    error: element?.classList.contains('error') || false,
    busy: document.body.classList.contains('busy'),
  };
}

function createMutationSummary() {
  return { total: 0, attributes: 0, childList: 0, addedNodes: 0, removedNodes: 0, attributeNames: {}, touched: [] };
}

function addTouchedNode(summary, element) {
  const identity = elementIdentity(element);
  if (!identity || summary.touched.includes(identity) || summary.touched.length >= 30) return;
  summary.touched.push(identity);
}

function publicAction(action) {
  return {
    id: action.id,
    name: action.name,
    readOnly: action.readOnly,
    elapsedMs: round(performance.now() - action.startedAt),
    mutations: action.mutations,
  };
}

function captureMemory() {
  const memory = performance.memory;
  return memory ? {
    usedJsHeapSize: memory.usedJSHeapSize || 0,
    totalJsHeapSize: memory.totalJSHeapSize || 0,
    jsHeapSizeLimit: memory.jsHeapSizeLimit || 0,
  } : null;
}

function elementIdentity(element) {
  if (!element || !(element instanceof Element)) return null;
  const id = element.id ? `#${element.id}` : '';
  const classes = [...element.classList].slice(0, 4).map((name) => `.${name}`).join('');
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function surfaceClassHint(surface) {
  return ({ smartWrap: 'smart-wrap', aligned: 'aligned-compare', tree: 'tree-view', fold: 'fold-code', editor: 'editor' })[surface] || surface;
}

function isVisible(element) {
  if (!element || element.classList?.contains('hidden')) return false;
  let style;
  try { style = getComputedStyle(element); } catch (_) { return false; }
  const rect = element.getBoundingClientRect?.();
  return !!rect && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
}

function safeCall(fn, fallback) {
  try {
    const value = fn();
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
