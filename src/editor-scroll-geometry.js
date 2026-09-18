const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const wraps = panes.map((pane) => pane?.querySelector('.editor-wrap'));

const CODE_GUTTER_PX = 78;
const SCROLLBAR_SIZE_PX = 14;
const MIN_THUMB_PX = 52;

const rails = [];
const thumbs = [];
const states = panes.map(() => ({
  scroller: null,
  surface: 'none',
  horizontal: false,
  vertical: false,
  frame: 0,
  drag: null,
}));

installStyles();
for (let index = 0; index < panes.length; index += 1) installPane(index);
installGlobalHooks();

window.PayloadDiffHorizontalScrollbars = {
  refresh: (index = null) => {
    if (index == null) panes.forEach((_, paneIndex) => scheduleUpdate(paneIndex));
    else scheduleUpdate(index);
  },
  get: () => states.map((_, index) => publicState(index)),
};

function installPane(index) {
  const wrap = wraps[index];
  if (!wrap) return;

  const rail = document.createElement('div');
  rail.className = 'pd-horizontal-scrollbar hidden';
  rail.dataset.pane = String(index);
  rail.tabIndex = 0;
  rail.setAttribute('role', 'scrollbar');
  rail.setAttribute('aria-orientation', 'horizontal');
  rail.setAttribute('aria-label', `File ${index + 1} horizontal scrollbar`);
  rail.setAttribute('aria-valuemin', '0');

  const thumb = document.createElement('div');
  thumb.className = 'pd-horizontal-scrollbar-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  rail.appendChild(thumb);
  wrap.appendChild(rail);

  rails[index] = rail;
  thumbs[index] = thumb;

  for (const surface of candidateSurfaces(index)) {
    surface?.addEventListener('scroll', () => scheduleUpdate(index), { passive: true });
  }

  rail.addEventListener('pointerdown', (event) => onRailPointerDown(index, event));
  thumb.addEventListener('pointerdown', (event) => onThumbPointerDown(index, event));
  rail.addEventListener('keydown', (event) => onRailKeyDown(index, event));

  const observer = new MutationObserver(() => scheduleUpdate(index));
  for (const surface of candidateSurfaces(index)) {
    if (!surface) continue;
    observer.observe(surface, {
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    const resize = new ResizeObserver(() => scheduleUpdate(index));
    resize.observe(wrap);
    for (const surface of candidateSurfaces(index)) if (surface) resize.observe(surface);
  }

  scheduleUpdate(index);
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
    'payloaddiff:content-layout-changed',
    'payloaddiff:fold-state-changed',
  ];

  for (const type of events) {
    window.addEventListener(type, () => panes.forEach((_, index) => scheduleUpdate(index)));
  }

  document.querySelectorAll('.view-tabs').forEach((tabs) => {
    tabs.addEventListener('click', () => {
      const index = Number(tabs.dataset.pane);
      requestAnimationFrame(() => scheduleUpdate(index));
    }, true);
  });

  window.addEventListener('resize', () => panes.forEach((_, index) => scheduleUpdate(index)), { passive: true });
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

function scheduleUpdate(index) {
  const item = states[index];
  if (!item || item.frame) return;
  item.frame = requestAnimationFrame(() => {
    item.frame = 0;
    update(index);
  });
}

function update(index) {
  const item = states[index];
  const rail = rails[index];
  const thumb = thumbs[index];
  const wrap = wraps[index];
  if (!item || !rail || !thumb || !wrap) return;

  const selected = activeScroller(index);
  const scroller = selected.element;
  item.scroller = scroller;
  item.surface = selected.surface;

  if (!scroller) {
    item.horizontal = false;
    item.vertical = false;
    rail.classList.add('hidden');
    wrap.classList.remove('pd-horizontal-scrollbar-present');
    return;
  }

  const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const horizontal = maxScrollLeft > 1 && getComputedStyle(scroller).overflowX !== 'hidden';
  const vertical = maxScrollTop > 1 && getComputedStyle(scroller).overflowY !== 'hidden';
  item.horizontal = horizontal;
  item.vertical = vertical;

  rail.classList.toggle('hidden', !horizontal);
  wrap.classList.toggle('pd-horizontal-scrollbar-present', horizontal);
  rail.dataset.surface = selected.surface;

  if (!horizontal) return;

  const fixedGutter = selected.surface === 'code' || selected.surface === 'fold' || selected.surface === 'aligned';
  rail.style.left = fixedGutter ? `${CODE_GUTTER_PX}px` : '4px';
  rail.style.right = vertical ? `${SCROLLBAR_SIZE_PX + 4}px` : '4px';

  const trackWidth = Math.max(1, rail.clientWidth);
  const ratio = Math.min(1, scroller.clientWidth / Math.max(1, scroller.scrollWidth));
  const thumbWidth = Math.min(trackWidth, Math.max(MIN_THUMB_PX, trackWidth * ratio));
  const travel = Math.max(0, trackWidth - thumbWidth);
  const progress = maxScrollLeft > 0 ? Math.min(1, Math.max(0, scroller.scrollLeft / maxScrollLeft)) : 0;
  const thumbLeft = travel * progress;

  thumb.style.width = `${thumbWidth}px`;
  thumb.style.transform = `translateX(${thumbLeft}px)`;
  rail.setAttribute('aria-valuemax', String(Math.round(maxScrollLeft)));
  rail.setAttribute('aria-valuenow', String(Math.round(scroller.scrollLeft)));
  rail.setAttribute('aria-valuetext', `${Math.round(progress * 100)}% scrolled`);
}

function onThumbPointerDown(index, event) {
  const item = states[index];
  const rail = rails[index];
  const thumb = thumbs[index];
  const scroller = item?.scroller;
  if (!item || !rail || !thumb || !scroller || !item.horizontal) return;

  event.preventDefault();
  event.stopPropagation();
  thumb.setPointerCapture?.(event.pointerId);
  rail.classList.add('dragging');

  const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const travel = Math.max(1, rail.clientWidth - thumb.offsetWidth);
  item.drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startScrollLeft: scroller.scrollLeft,
    maxScrollLeft,
    travel,
  };

  const move = (moveEvent) => {
    if (!item.drag || moveEvent.pointerId !== item.drag.pointerId) return;
    const delta = moveEvent.clientX - item.drag.startX;
    scroller.scrollLeft = item.drag.startScrollLeft + (delta / item.drag.travel) * item.drag.maxScrollLeft;
    scheduleUpdate(index);
  };

  const finish = (upEvent) => {
    if (!item.drag || upEvent.pointerId !== item.drag.pointerId) return;
    thumb.releasePointerCapture?.(upEvent.pointerId);
    thumb.removeEventListener('pointermove', move);
    thumb.removeEventListener('pointerup', finish);
    thumb.removeEventListener('pointercancel', finish);
    rail.classList.remove('dragging');
    item.drag = null;
    scheduleUpdate(index);
  };

  thumb.addEventListener('pointermove', move);
  thumb.addEventListener('pointerup', finish);
  thumb.addEventListener('pointercancel', finish);
}

function onRailPointerDown(index, event) {
  if (event.target === thumbs[index]) return;
  const item = states[index];
  const rail = rails[index];
  const scroller = item?.scroller;
  if (!item || !rail || !scroller || !item.horizontal) return;

  event.preventDefault();
  const rect = rail.getBoundingClientRect();
  const thumbWidth = thumbs[index]?.offsetWidth || MIN_THUMB_PX;
  const travel = Math.max(1, rail.clientWidth - thumbWidth);
  const target = Math.min(travel, Math.max(0, event.clientX - rect.left - thumbWidth / 2));
  const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  scroller.scrollLeft = (target / travel) * maxScrollLeft;
  rail.focus({ preventScroll: true });
  scheduleUpdate(index);
}

function onRailKeyDown(index, event) {
  const item = states[index];
  const scroller = item?.scroller;
  if (!item || !scroller || !item.horizontal) return;

  const page = Math.max(80, scroller.clientWidth * 0.9);
  const step = Math.max(40, (parseFloat(getComputedStyle(scroller).fontSize) || 13) * 8);
  let next = null;
  if (event.key === 'ArrowRight') next = scroller.scrollLeft + step;
  else if (event.key === 'ArrowLeft') next = scroller.scrollLeft - step;
  else if (event.key === 'PageDown') next = scroller.scrollLeft + page;
  else if (event.key === 'PageUp') next = scroller.scrollLeft - page;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = scroller.scrollWidth;
  if (next == null) return;

  event.preventDefault();
  scroller.scrollLeft = next;
  scheduleUpdate(index);
}

function publicState(index) {
  const item = states[index];
  const scroller = item?.scroller;
  return {
    pane: index + 1,
    surface: item?.surface || 'none',
    visible: !!item?.horizontal && !!rails[index] && !rails[index].classList.contains('hidden'),
    scrollLeft: Math.round(scroller?.scrollLeft || 0),
    maxScrollLeft: scroller ? Math.round(Math.max(0, scroller.scrollWidth - scroller.clientWidth)) : 0,
    leftInset: rails[index] ? Math.round(parseFloat(rails[index].style.left) || 0) : 0,
  };
}

function installStyles() {
  if (document.querySelector('#editor-scroll-geometry-styles')) return;
  const style = document.createElement('style');
  style.id = 'editor-scroll-geometry-styles';
  style.textContent = `
    :root {
      --pd-code-gutter-width: ${CODE_GUTTER_PX}px;
      --pd-scrollbar-size: ${SCROLLBAR_SIZE_PX}px;
    }

    /* One scrollbar owner: browser scrolling stays enabled, but native chrome is
       hidden so it can never duplicate the app-owned rails or sit below gutters. */
    .editor,
    .tree-view,
    .fold-code-view,
    .aligned-compare-view {
      scrollbar-width: none !important;
      -ms-overflow-style: none;
    }
    .editor::-webkit-scrollbar,
    .tree-view::-webkit-scrollbar,
    .fold-code-view::-webkit-scrollbar,
    .aligned-compare-view::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
      display: none !important;
    }

    /* Canonical code gutter. Payload text may scroll behind this layer, but the
       entire reserved region is opaque so no glyph can leak into line numbers. */
    .editor.editor-with-line-numbers {
      padding-left: var(--pd-code-gutter-width) !important;
    }
    .editor-line-gutter {
      left: 0 !important;
      width: var(--pd-code-gutter-width) !important;
      z-index: 8 !important;
    }
    .code-fold-gutter {
      left: 0 !important;
      z-index: 9 !important;
    }
    .editor-indent-guides,
    .syntax-line-layer {
      left: var(--pd-code-gutter-width) !important;
    }

    .pd-horizontal-scrollbar {
      position: absolute;
      z-index: 40;
      left: var(--pd-code-gutter-width);
      right: 4px;
      bottom: 2px;
      height: 13px;
      border: 1px solid #2a3852;
      border-radius: 999px;
      background: #111b2e;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), 0 0 0 1px rgba(0,0,0,.22);
      overflow: hidden;
      cursor: pointer;
      touch-action: none;
      user-select: none;
    }
    .pd-horizontal-scrollbar.hidden { display: none !important; }
    .pd-horizontal-scrollbar-thumb {
      position: absolute;
      left: 0;
      top: 2px;
      height: 7px;
      min-width: ${MIN_THUMB_PX}px;
      border-radius: 999px;
      background: #7187a8;
      box-shadow: 0 0 0 1px rgba(255,255,255,.07), 0 1px 3px rgba(0,0,0,.24);
      cursor: grab;
      will-change: transform, width;
    }
    .pd-horizontal-scrollbar:hover {
      border-color: #455a7e;
      background: #15223a;
    }
    .pd-horizontal-scrollbar:hover .pd-horizontal-scrollbar-thumb { background: #8fa5c6; }
    .pd-horizontal-scrollbar.dragging .pd-horizontal-scrollbar-thumb {
      background: #a8bce0;
      cursor: grabbing;
    }
    .pd-horizontal-scrollbar:focus-visible {
      outline: 2px solid #60a5fa;
      outline-offset: 1px;
    }

    /* Leave the horizontal rail its own row; content remains scrollable all the
       way to the end without the vertical rail covering the corner. */
    .editor-wrap.pd-horizontal-scrollbar-present .pd-scrollbar-rail {
      bottom: calc(var(--pd-scrollbar-size) + 5px) !important;
    }

    html[data-theme="light"] .pd-horizontal-scrollbar {
      border-color: #b8c4d3;
      background: #e2e8f0;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.75), 0 0 0 1px rgba(15,23,42,.06);
    }
    html[data-theme="light"] .pd-horizontal-scrollbar-thumb {
      background: #64748b;
      box-shadow: 0 0 0 1px rgba(15,23,42,.12), 0 1px 2px rgba(15,23,42,.16);
    }
    html[data-theme="light"] .pd-horizontal-scrollbar:hover {
      border-color: #94a3b8;
      background: #d8e0ea;
    }
    html[data-theme="light"] .pd-horizontal-scrollbar:hover .pd-horizontal-scrollbar-thumb { background: #475569; }
    html[data-theme="light"] .pd-horizontal-scrollbar.dragging .pd-horizontal-scrollbar-thumb { background: #334155; }
  `;
  document.head.appendChild(style);
}
