const panes = [...document.querySelectorAll('.pane')];

installStyles();
for (let index = 0; index < panes.length; index += 1) installGuard(index);

function installGuard(index) {
  const pane = panes[index];
  const wrap = pane?.querySelector('.editor-wrap');
  const editor = pane?.querySelector('.editor');
  if (!pane || !wrap || !editor) return;

  const sync = () => {
    const overlay = wrap.querySelector('.editor-diff-overlay');
    const treeActive = pane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
    const overlayVisible = !!overlay && !overlay.classList.contains('hidden') && !treeActive;

    editor.classList.toggle('compare-overlay-editor-active', overlayVisible);
    wrap.classList.toggle('compare-overlay-active', overlayVisible);

    // Zero-difference comparisons still create the diff overlay. The editor
    // must remain the visible text surface even when there are no diff bands.
    if (overlayVisible) editor.classList.remove('hidden');
  };

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'attributes' && mutation.attributeName === 'class')) sync();
  });

  const attachOverlayObserver = () => {
    const overlay = wrap.querySelector('.editor-diff-overlay');
    if (overlay) observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  };

  attachOverlayObserver();
  const childObserver = new MutationObserver(() => {
    attachOverlayObserver();
    sync();
  });
  childObserver.observe(wrap, { childList: true });

  pane.querySelector('.view-tabs')?.addEventListener('click', () => requestAnimationFrame(sync));
  window.addEventListener('payloaddiff:live-compare-updated', sync);
  window.addEventListener('payloaddiff:comparison-reset', sync);
  window.addEventListener('payloaddiff:view-surface-synced', (event) => {
    if (event.detail?.paneIndex === index) sync();
  });
  window.addEventListener('payloaddiff:theme-changed', sync);

  sync();
}

function installStyles() {
  if (document.querySelector('#compare-surface-guard-styles')) return;
  const style = document.createElement('style');
  style.id = 'compare-surface-guard-styles';
  style.textContent = `
    /* Rendering invariant: when Code comparison is active, text belongs above
       the diff background. This must hold for zero diffs, fallback text diff,
       JSON/XML, and both themes. */
    .editor-wrap.code-surface-active > .editor.compare-overlay-editor-active,
    .editor-wrap.compare-overlay-active > .editor.compare-overlay-editor-active {
      position: relative !important;
      z-index: 2 !important;
      background: transparent !important;
    }

    html[data-theme="dark"] .editor.compare-overlay-editor-active {
      color: #e5edf9 !important;
      caret-color: #e5edf9 !important;
    }

    html[data-theme="light"] .editor.compare-overlay-editor-active {
      color: #1e293b !important;
      caret-color: #1e293b !important;
    }

    .editor-wrap.compare-overlay-active > .editor-diff-overlay {
      z-index: 1 !important;
    }

    /* Tree remains authoritative if a worker-backed view switch finishes while
       a comparison overlay is active. */
    .editor-wrap.tree-surface-active > .editor.compare-overlay-editor-active {
      display: none !important;
      visibility: hidden !important;
    }
  `;
  document.head.appendChild(style);
}
