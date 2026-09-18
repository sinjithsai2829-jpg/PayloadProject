const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
let latestDetail = null;
let decorateFrame = 0;
let recompareTimer = 0;

installStyles();

window.addEventListener('payloaddiff:live-compare-updated', (event) => {
  latestDetail = event.detail || null;
  scheduleDecorate();
});

window.addEventListener('payloaddiff:compare-options-changed', () => {
  clearTimeout(recompareTimer);
  recompareTimer = window.setTimeout(() => {
    if (!window.PayloadDiffCompareSession?.isActive?.()) return;
    const left = editors[0]?.value || '';
    const right = editors[1]?.value || '';
    if (!left.trim() || !right.trim()) return;
    document.querySelector('#compareBtn')?.click();
  }, 80);
});

window.addEventListener('payloaddiff:word-wrap-layout', scheduleDecorate);
window.addEventListener('payloaddiff:view-surface-synced', scheduleDecorate);

function scheduleDecorate() {
  if (decorateFrame) return;
  decorateFrame = requestAnimationFrame(() => {
    decorateFrame = 0;
    const detail = latestDetail;
    if (!detail || !Array.isArray(detail.diffs)) return;
    const options = window.PayloadDiffCompareOptions?.get?.() || {};
    const movedIds = new Set();
    for (const diff of detail.diffs) {
      if (diff?.move?.id) movedIds.add(diff.move.id);
    }

    // Group boundaries and move classes are part of the persistent aligned
    // comparison model. Do not rebuild alignment or scan rendered DOM here:
    // navigation should only move the active selection, just like ComparePlus.
    try {
      window.PayloadDiffDiagnostics?.log?.('debug', 'comparison.notepad-features-decorated', {
        movedPairs: movedIds.size,
        grouped: options.groupNearbyDiffs !== false,
        ignoreWhitespace: options.ignoreWhitespace === true,
        ignoreCase: options.ignoreCase === true,
      });
    } catch (_) {}
  });
}

function installStyles() {
  if (document.querySelector('#compare-options-enhancement-styles')) return;
  const style = document.createElement('style');
  style.id = 'compare-options-enhancement-styles';
  style.textContent = `
    .aligned-compare-row.diff-block-start { box-shadow: inset 0 1px 0 rgba(148,163,184,.42); }
    .aligned-compare-row.diff-block-end { box-shadow: inset 0 -1px 0 rgba(148,163,184,.42); }
    .aligned-compare-row.diff-block-start.diff-block-end { box-shadow: inset 0 1px 0 rgba(148,163,184,.42), inset 0 -1px 0 rgba(148,163,184,.42); }

    .aligned-compare-row.moved-from,
    .aligned-compare-row.moved-to {
      background-color: rgba(168,85,247,.18) !important;
      border-left-color: #c084fc !important;
    }
    .aligned-compare-row.moved-from .aligned-compare-gutter::before,
    .aligned-compare-row.moved-to .aligned-compare-gutter::before {
      content: '↕';
      position: absolute;
      left: 7px;
      color: #c084fc;
      font-weight: 800;
    }
    .aligned-compare-row.moved-multiple .aligned-compare-gutter::before { content: '⇅'; }
    .aligned-compare-row.moved-from .aligned-compare-text::after,
    .aligned-compare-row.moved-to .aligned-compare-text::after {
      content: ' moved';
      margin-left: 10px;
      padding: 1px 5px;
      border: 1px solid rgba(192,132,252,.55);
      border-radius: 999px;
      color: #d8b4fe;
      font: 600 10px/1.4 Inter, ui-sans-serif, system-ui, sans-serif;
      vertical-align: 1px;
    }
    html[data-theme="light"] .aligned-compare-row.moved-from,
    html[data-theme="light"] .aligned-compare-row.moved-to { background-color: rgba(147,51,234,.10) !important; border-left-color:#9333ea !important; }
    html[data-theme="light"] .aligned-compare-row.moved-from .aligned-compare-gutter::before,
    html[data-theme="light"] .aligned-compare-row.moved-to .aligned-compare-gutter::before,
    html[data-theme="light"] .aligned-compare-row.moved-from .aligned-compare-text::after,
    html[data-theme="light"] .aligned-compare-row.moved-to .aligned-compare-text::after { color:#7e22ce; }
  `;
  document.head.appendChild(style);
}
