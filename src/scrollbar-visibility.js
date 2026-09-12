const panes = [...document.querySelectorAll('.pane')];
const wraps = panes.map((pane) => pane?.querySelector('.editor-wrap'));
const MIN_THUMB_PX = 52;
const rails = [];
const thumbs = [];
const states = panes.map(() => ({
  scroller: null,
  surface: 'none',
  scrollable: false,
  frame: 0,
  lastSignature: '',
  drag: null,
}));

installStyles();
for (let index = 0; index < panes.length; index += 1) installPane(index);
installGlobalHooks();

window.PayloadDiffScrollbars = {
  refresh: (index = null) => {
    if (index == null) panes.forEach((_, paneIndex) => scheduleUpdate(paneIndex, 'api'));
    else scheduleUpdate(index, 'api');
  },
  getPaneState: (index) => publicState(index),
  get: () => panes.map((_, index) => publicState(index)),
};

function installPane(index) {
  const wrap = wraps[index];
  if (!wrap) return;

  wrap.classList.add('pd-persistent-scrollbar-host');

  const rail = document.createElement('div');
  rail.className = 'pd-scrollbar-rail hidden';
  rail.dataset.pane = String(index);
  rail.tabIndex = 0;
  rail.setAttribute('role', 'scrollbar');
  rail.setAttribute('aria-orientation', 'vertical');
  rail.setAttribute('aria-label', `File ${index + 1} vertical scrollbar`);
  rail.setAttribute('aria-valuemin', '0');

  const thumb = document.createElement('div');
  thumb.className = 'pd-scrollbar-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  rail.appendChild(thumb);
  wrap.appendChild(rail);

  rails[index] = rail;
  thumbs[index] = thumb;

  for (const surface of candidateSurfaces(index)) {
    surface?.addEventListener('scroll', () => scheduleUpdate(index, 'scroll'), { passive: true });
  }

  rail.addEventListener('pointerdown', (event) => onRailPointerDown(index, event));
  thumb.addEventListener('pointerdown', (event) => onThumbPointerDown(index, event));
  rail.addEventListener('keydown', (event) => onRailKeyDown(index, event));

  const attributeObserver = new MutationObserver(() => scheduleUpdate(index, 'surface-state'));
  for (const surface of candidateSurfaces(index)) {
    if (!surface) continue;
    attributeObserver.observe(surface, {
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => scheduleUpdate(index, 'resize'));
    observer.observe(wrap);
    for (const surface of candidateSurfaces(index)) if (surface) observer.observe(surface);
  }

  scheduleUpdate(index, 'install');
}

function installGlobalHooks() {
  const events = [
    'payloaddiff:view-surface-synced',
    'payloaddiff:live-compare-updated',
    'payloaddiff:comparison-reset',
    'payloaddiff:theme-changed',
    'payloaddiff:word-wrap-changed',
    'payloaddiff:word-wrap-layout',
    'payloaddiff:syntax-issues-updated',
  ];
  for (const type of events) {
    window.addEventListener(type, () => panes.forEach((_, index) => scheduleUpdate(index, type)));
  }

  document.querySelectorAll('.view-tabs').forEach((tabs) => {
    tabs.addEventListener('click', () => {
      const index = Number(tabs.dataset.pane);
      requestAnimationFrame(() => scheduleUpdate(index, 'view-click'));
    }, true);
  });

  window.addEventListener('resize', () => panes.forEach((_, index) => scheduleUpdate(index, 'window-resize')), { passive: true });
}

function candidateSurfaces(index) {
  const pane = panes[index];
  if (!pane) return [];
  return [
    pane.querySelector('.aligned-compare-view'),
    pane.querySelector('.fold-code-view'),
    pane.querySelector('.tree-view'),
    pane.querySelector('.editor'),
  ].filter(Boolean);
}

function activeScroller(index) {
  const pane = panes[index];
  if (!pane) return { element: null, surface: 'none' };

  const candidates = [
    ['aligned', pane.querySelector('.aligned-compare-view')],
    ['fold', pane.querySelector('.fold-code-view')],
    ['tree', pane.querySelector('.tree-view')],
    ['code', pane.querySelector('.editor')],
  ];

  for (const [surface, element] of candidates) {
    if (surfaceVisible(element)) return { element, surface };
  }
  return { element: null, surface: 'none' };
}

function surfaceVisible(element) {
  if (!element || element.classList.contains('hidden')) return false;
  let style;
  try { style = getComputedStyle(element); } catch (_) { return false; }
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function scheduleUpdate(index, reason) {
  const item = states[index];
  if (!item || item.frame) return;
  item.frame = requestAnimationFrame(() => {
    item.frame = 0;
    update(index, reason);
  });
}

function update(index, reason = 'update') {
  const rail = rails[index];
  const thumb = thumbs[index];
  const wrap = wraps[index];
  const item = states[index];
  if (!rail || !thumb || !wrap || !item) return;

  const selected = activeScroller(index);
  const scroller = selected.element;
  item.scroller = scroller;
  item.surface = selected.surface;

  if (!scroller) {
    item.scrollable = false;
    rail.classList.add('hidden');
    wrap.classList.remove('pd-scrollbar-present');
    logStateIfChanged(index, reason);
    return;
  }

  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const scrollable = maxScroll > 1;
  item.scrollable = scrollable;

  rail.classList.toggle('hidden', !scrollable);
  wrap.classList.toggle('pd-scrollbar-present', scrollable);
  rail.dataset.surface = selected.surface;

  if (!scrollable) {
    logStateIfChanged(index, reason);
    return;
  }

  const hasHorizontal = scroller.scrollWidth - scroller.clientWidth > 2 && getComputedStyle(scroller).overflowX !== 'hidden';
  rail.style.bottom = hasHorizontal ? '19px' : '4px';

  const trackHeight = Math.max(1, rail.clientHeight);
  const ratio = Math.min(1, scroller.clientHeight / Math.max(1, scroller.scrollHeight));
  const thumbHeight = Math.min(trackHeight, Math.max(MIN_THUMB_PX, trackHeight * ratio));
  const travel = Math.max(0, trackHeight - thumbHeight);
  const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / maxScroll)) : 0;
  const thumbTop = travel * progress;

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${thumbTop}px)`;
  rail.setAttribute('aria-valuemax', String(Math.round(maxScroll)));
  rail.setAttribute('aria-valuenow', String(Math.round(scroller.scrollTop)));
  rail.setAttribute('aria-valuetext', `${Math.round(progress * 100)}% scrolled`);

  logStateIfChanged(index, reason, {
    maxScroll,
    trackHeight,
    thumbHeight,
    thumbTop,
    progress,
    hasHorizontal,
  });
}

function onThumbPointerDown(index, event) {
  const item = states[index];
  const rail = rails[index];
  const thumb = thumbs[index];
  const scroller = item?.scroller;
  if (!item || !rail || !thumb || !scroller || !item.scrollable) return;

  event.preventDefault();
  event.stopPropagation();
  thumb.setPointerCapture?.(event.pointerId);
  rail.classList.add('dragging');

  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const travel = Math.max(1, rail.clientHeight - thumb.offsetHeight);
  item.drag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: scroller.scrollTop,
    maxScroll,
    travel,
  };

  const move = (moveEvent) => {
    if (!item.drag || moveEvent.pointerId !== item.drag.pointerId) return;
    const delta = moveEvent.clientY - item.drag.startY;
    scroller.scrollTop = item.drag.startScrollTop + (delta / item.drag.travel) * item.drag.maxScroll;
    scheduleUpdate(index, 'drag');
  };

  const finish = (upEvent) => {
    if (!item.drag || upEvent.pointerId !== item.drag.pointerId) return;
    thumb.releasePointerCapture?.(upEvent.pointerId);
    thumb.removeEventListener('pointermove', move);
    thumb.removeEventListener('pointerup', finish);
    thumb.removeEventListener('pointercancel', finish);
    rail.classList.remove('dragging');
    item.drag = null;
    scheduleUpdate(index, 'drag-end');
    try {
      window.PayloadDiffDiagnostics?.log?.('debug', 'scrollbar.drag-ended', publicState(index));
    } catch (_) {}
  };

  thumb.addEventListener('pointermove', move);
  thumb.addEventListener('pointerup', finish);
  thumb.addEventListener('pointercancel', finish);

  try {
    window.PayloadDiffDiagnostics?.log?.('debug', 'scrollbar.drag-started', publicState(index));
  } catch (_) {}
}

function onRailPointerDown(index, event) {
  if (event.target === thumbs[index]) return;
  const rail = rails[index];
  const item = states[index];
  const scroller = item?.scroller;
  if (!rail || !item || !scroller || !item.scrollable) return;

  event.preventDefault();
  const rect = rail.getBoundingClientRect();
  const thumbHeight = thumbs[index]?.offsetHeight || MIN_THUMB_PX;
  const travel = Math.max(1, rail.clientHeight - thumbHeight);
  const target = Math.min(travel, Math.max(0, event.clientY - rect.top - thumbHeight / 2));
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = (target / travel) * maxScroll;
  rail.focus({ preventScroll: true });
  scheduleUpdate(index, 'track-click');
}

function onRailKeyDown(index, event) {
  const item = states[index];
  const scroller = item?.scroller;
  if (!item || !scroller || !item.scrollable) return;

  const page = Math.max(40, scroller.clientHeight * 0.9);
  const step = Math.max(20, parseFloat(getComputedStyle(scroller).lineHeight) || 20) * 3;
  let next = null;
  if (event.key === 'ArrowDown') next = scroller.scrollTop + step;
  else if (event.key === 'ArrowUp') next = scroller.scrollTop - step;
  else if (event.key === 'PageDown') next = scroller.scrollTop + page;
  else if (event.key === 'PageUp') next = scroller.scrollTop - page;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = scroller.scrollHeight;
  if (next == null) return;

  event.preventDefault();
  scroller.scrollTop = next;
  scheduleUpdate(index, 'keyboard');
}

function publicState(index) {
  const item = states[index];
  const rail = rails[index];
  const thumb = thumbs[index];
  const scroller = item?.scroller;
  const maxScroll = scroller ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0;
  return {
    pane: index + 1,
    theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    surface: item?.surface || 'none',
    visible: !!item?.scrollable && !!rail && !rail.classList.contains('hidden'),
    scrollTop: Math.round(scroller?.scrollTop || 0),
    maxScroll: Math.round(maxScroll),
    scrollHeight: Math.round(scroller?.scrollHeight || 0),
    clientHeight: Math.round(scroller?.clientHeight || 0),
    trackHeight: Math.round(rail?.clientHeight || 0),
    thumbHeight: Math.round(thumb?.offsetHeight || 0),
    thumbTop: thumb ? roundTransformY(thumb.style.transform) : 0,
    progress: maxScroll > 0 ? Math.round(((scroller?.scrollTop || 0) / maxScroll) * 1000) / 1000 : 0,
  };
}

function logStateIfChanged(index, reason, metrics = null) {
  const item = states[index];
  if (!item) return;
  const state = publicState(index);
  const signature = JSON.stringify({
    theme: state.theme,
    surface: state.surface,
    visible: state.visible,
    scrollHeight: state.scrollHeight,
    clientHeight: state.clientHeight,
    trackHeight: state.trackHeight,
    thumbHeight: state.thumbHeight,
  });
  if (signature === item.lastSignature) return;
  item.lastSignature = signature;

  const detail = { ...state, reason, ...(metrics ? {
    hasHorizontal: !!metrics.hasHorizontal,
  } : {}) };

  window.dispatchEvent(new CustomEvent('payloaddiff:scrollbar-state-changed', { detail }));
  try {
    window.PayloadDiffDiagnostics?.log?.('debug', 'scrollbar.state-changed', detail);
  } catch (_) {}
}

function roundTransformY(value) {
  const match = String(value || '').match(/translateY\((-?[\d.]+)px\)/);
  return match ? Math.round(Number(match[1]) || 0) : 0;
}

function installStyles() {
  if (document.querySelector('#scrollbar-visibility-styles')) return;
  const style = document.createElement('style');
  style.id = 'scrollbar-visibility-styles';
  style.textContent = `
    /* Native scrollbars remain as a fallback, especially for horizontal
       scrolling. The app-owned vertical rail sits above them so macOS overlay
       auto-hide behavior can never make panel navigation disappear. */
    .editor,
    .tree-view,
    .fold-code-view,
    .aligned-compare-view {
      scrollbar-width: auto !important;
      scrollbar-color: #647896 #08101d;
      scrollbar-gutter: stable;
      color-scheme: dark;
    }

    .editor::-webkit-scrollbar,
    .tree-view::-webkit-scrollbar,
    .fold-code-view::-webkit-scrollbar,
    .aligned-compare-view::-webkit-scrollbar {
      width: 14px;
      height: 14px;
    }

    .editor::-webkit-scrollbar-track,
    .tree-view::-webkit-scrollbar-track,
    .fold-code-view::-webkit-scrollbar-track,
    .aligned-compare-view::-webkit-scrollbar-track {
      background: #08101d;
    }

    .editor::-webkit-scrollbar-thumb,
    .tree-view::-webkit-scrollbar-thumb,
    .fold-code-view::-webkit-scrollbar-thumb,
    .aligned-compare-view::-webkit-scrollbar-thumb {
      background: #647896;
      border: 3px solid #08101d;
      border-radius: 999px;
      background-clip: padding-box;
    }

    .pd-scrollbar-rail {
      position: absolute;
      z-index: 40;
      top: 4px;
      right: 2px;
      bottom: 4px;
      width: 13px;
      border: 1px solid #2a3852;
      border-radius: 999px;
      background: #111b2e;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), 0 0 0 1px rgba(0,0,0,.22);
      overflow: hidden;
      cursor: pointer;
      touch-action: none;
      user-select: none;
      opacity: 1;
      transition: border-color .12s ease, background .12s ease;
    }

    .pd-scrollbar-rail.hidden {
      display: none !important;
    }

    .pd-scrollbar-thumb {
      position: absolute;
      top: 0;
      left: 2px;
      width: 7px;
      min-height: 52px;
      border-radius: 999px;
      background: #7187a8;
      box-shadow: 0 0 0 1px rgba(255,255,255,.07), 0 1px 3px rgba(0,0,0,.24);
      cursor: grab;
      will-change: transform, height;
    }

    .pd-scrollbar-rail:hover {
      border-color: #455a7e;
      background: #15223a;
    }
    .pd-scrollbar-rail:hover .pd-scrollbar-thumb { background: #8fa5c6; }
    .pd-scrollbar-rail.dragging .pd-scrollbar-thumb {
      background: #a8bce0;
      cursor: grabbing;
    }
    .pd-scrollbar-rail:focus-visible {
      outline: 2px solid #60a5fa;
      outline-offset: 1px;
    }

    /* Keep syntax markers visible beside, rather than underneath, the app-owned
       scrollbar. */
    .editor-wrap.pd-scrollbar-present .syntax-error-rail {
      right: 17px !important;
    }

    html[data-theme="light"] .editor,
    html[data-theme="light"] .tree-view,
    html[data-theme="light"] .fold-code-view,
    html[data-theme="light"] .aligned-compare-view {
      scrollbar-color: #64748b #e2e8f0 !important;
      color-scheme: light;
    }

    html[data-theme="light"] .editor::-webkit-scrollbar-track,
    html[data-theme="light"] .tree-view::-webkit-scrollbar-track,
    html[data-theme="light"] .fold-code-view::-webkit-scrollbar-track,
    html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-track {
      background: #e2e8f0 !important;
    }

    html[data-theme="light"] .editor::-webkit-scrollbar-thumb,
    html[data-theme="light"] .tree-view::-webkit-scrollbar-thumb,
    html[data-theme="light"] .fold-code-view::-webkit-scrollbar-thumb,
    html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-thumb {
      background: #64748b !important;
      border-color: #e2e8f0 !important;
    }

    html[data-theme="light"] .pd-scrollbar-rail {
      border-color: #b8c4d3;
      background: #e2e8f0;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.75), 0 0 0 1px rgba(15,23,42,.06);
    }
    html[data-theme="light"] .pd-scrollbar-thumb {
      background: #64748b;
      box-shadow: 0 0 0 1px rgba(15,23,42,.12), 0 1px 2px rgba(15,23,42,.16);
    }
    html[data-theme="light"] .pd-scrollbar-rail:hover {
      border-color: #94a3b8;
      background: #d8e0ea;
    }
    html[data-theme="light"] .pd-scrollbar-rail:hover .pd-scrollbar-thumb { background: #475569; }
    html[data-theme="light"] .pd-scrollbar-rail.dragging .pd-scrollbar-thumb { background: #334155; }

    @media (forced-colors: active) {
      .pd-scrollbar-rail { border: 1px solid CanvasText; background: Canvas; }
      .pd-scrollbar-thumb { background: CanvasText; }
    }
  `;
  document.head.appendChild(style);
}
