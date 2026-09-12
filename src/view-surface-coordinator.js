const panes = [...document.querySelectorAll('.pane')];

installStyles();

for (let index = 0; index < panes.length; index += 1) {
  installPaneCoordinator(index);
}

function installPaneCoordinator(index) {
  const pane = panes[index];
  const tabs = pane?.querySelector('.view-tabs');
  const wrap = pane?.querySelector('.editor-wrap');
  if (!pane || !tabs || !wrap) return;

  const syncSurface = () => {
    const treeButton = tabs.querySelector('.view-btn[data-view="tree"]');
    const codeButton = tabs.querySelector('.view-btn[data-view="code"]');
    const treeActive = !!treeButton?.classList.contains('active');
    const codeActive = !!codeButton?.classList.contains('active');

    // Tree wins if a transient async switch ever leaves both buttons active.
    // This prevents Code overlays from painting on top of a Tree that has just
    // finished building in a worker.
    wrap.classList.toggle('tree-surface-active', treeActive);
    wrap.classList.toggle('code-surface-active', !treeActive && codeActive);
    pane.dataset.activeView = treeActive ? 'tree' : 'code';

    window.dispatchEvent(new CustomEvent('payloaddiff:view-surface-synced', {
      detail: { paneIndex: index, view: treeActive ? 'tree' : 'code' },
    }));
  };

  // main.js can finish a JSON Tree switch asynchronously after formatting, and
  // xml-tree-ui.js can finish an XML Tree build asynchronously after parsing.
  // Observe the actual tab state rather than assuming the click completed the
  // view change synchronously.
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.type === 'attributes' && mutation.attributeName === 'class')) return;
    syncSurface();
  });

  for (const button of tabs.querySelectorAll('.view-btn')) {
    observer.observe(button, { attributes: true, attributeFilter: ['class'] });
  }

  tabs.addEventListener('click', () => {
    requestAnimationFrame(syncSurface);
    // A worker-backed Tree build may complete after the first frame. The
    // MutationObserver is the primary protection; these delayed checks also
    // cover code that replaces button classes rather than mutating them.
    setTimeout(syncSurface, 0);
  });

  window.addEventListener('payloaddiff:comparison-reset', syncSurface);
  window.addEventListener('payloaddiff:live-compare-updated', syncSurface);
  window.addEventListener('payloaddiff:fold-state-changed', syncSurface);

  syncSurface();
}

function installStyles() {
  if (document.querySelector('#view-surface-coordinator-styles')) return;
  const style = document.createElement('style');
  style.id = 'view-surface-coordinator-styles';
  style.textContent = `
    /* Tree owns the editor viewport completely. Code-only surfaces must never
       leak through after an asynchronous Tree build or synchronized tab move. */
    .editor-wrap.tree-surface-active > .editor,
    .editor-wrap.tree-surface-active > .fold-code-view,
    .editor-wrap.tree-surface-active > .code-fold-gutter,
    .editor-wrap.tree-surface-active > .editor-line-gutter,
    .editor-wrap.tree-surface-active > .editor-indent-guides,
    .editor-wrap.tree-surface-active > .editor-diff-overlay,
    .editor-wrap.tree-surface-active > .inline-diff-layer,
    .editor-wrap.tree-surface-active > .syntax-line-layer,
    .editor-wrap.tree-surface-active > .syntax-error-rail {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .editor-wrap.tree-surface-active > .tree-view {
      display: block !important;
      visibility: visible !important;
      width: 100%;
      height: 100%;
    }

    /* Code owns the viewport when Code is selected. This prevents a stale Tree
       from remaining visible while a Code overlay/editor is being restored. */
    .editor-wrap.code-surface-active > .tree-view {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}
