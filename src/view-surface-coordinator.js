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

    wrap.classList.toggle('tree-surface-active', treeActive);
    wrap.classList.toggle('code-surface-active', !treeActive && codeActive);
    pane.dataset.activeView = treeActive ? 'tree' : 'code';

    window.dispatchEvent(new CustomEvent('payloaddiff:view-surface-synced', {
      detail: { paneIndex: index, view: treeActive ? 'tree' : 'code' },
    }));
  };

  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.type === 'attributes' && mutation.attributeName === 'class')) return;
    syncSurface();
  });

  for (const button of tabs.querySelectorAll('.view-btn')) {
    observer.observe(button, { attributes: true, attributeFilter: ['class'] });
  }

  tabs.addEventListener('click', () => {
    requestAnimationFrame(syncSurface);
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
    .editor-wrap.tree-surface-active > .editor,
    .editor-wrap.tree-surface-active > .fold-code-view,
    .editor-wrap.tree-surface-active > .code-fold-gutter,
    .editor-wrap.tree-surface-active > .editor-line-gutter,
    .editor-wrap.tree-surface-active > .editor-indent-guides,
    .editor-wrap.tree-surface-active > .editor-diff-overlay,
    .editor-wrap.tree-surface-active > .inline-diff-layer,
    .editor-wrap.tree-surface-active > .syntax-line-layer,
    .editor-wrap.tree-surface-active > .syntax-error-rail,
    .editor-wrap.tree-surface-active > .aligned-compare-view {
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

    .editor-wrap.code-surface-active > .tree-view {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}
