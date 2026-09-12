const style = document.createElement('style');
style.id = 'aligned-compare-surface-guard-styles';
style.textContent = `
  /* The aligned view is a comparison projection, not a replacement payload.
     Keep the canonical textarea mounted and measurable behind it so diagnostics,
     persistence, selection state, and editing remain truthful. */
  .editor-wrap.aligned-compare-active > .editor {
    visibility: visible !important;
    pointer-events: none !important;
    position: relative;
    z-index: 0 !important;
  }

  .editor-wrap.aligned-compare-active > .aligned-compare-view {
    visibility: visible !important;
    pointer-events: auto !important;
    z-index: 20 !important;
  }

  .editor-wrap.tree-surface-active > .editor,
  .editor-wrap.tree-surface-active > .aligned-compare-view {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
`;
document.head.appendChild(style);
