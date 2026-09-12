const style = document.createElement('style');
style.id = 'scrollbar-visibility-styles';
style.textContent = `
  .editor,
  .tree-view,
  .fold-code-view,
  .aligned-compare-view {
    scrollbar-width: auto;
    scrollbar-color: #647896 #08101d;
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
    border-left: 1px solid #1e2a40;
  }

  .editor::-webkit-scrollbar-thumb,
  .tree-view::-webkit-scrollbar-thumb,
  .fold-code-view::-webkit-scrollbar-thumb,
  .aligned-compare-view::-webkit-scrollbar-thumb {
    min-height: 44px;
    background: #647896;
    border: 3px solid #08101d;
    border-radius: 999px;
    background-clip: padding-box;
  }

  .editor::-webkit-scrollbar-thumb:hover,
  .tree-view::-webkit-scrollbar-thumb:hover,
  .fold-code-view::-webkit-scrollbar-thumb:hover,
  .aligned-compare-view::-webkit-scrollbar-thumb:hover {
    background: #8aa0c2;
    border: 2px solid #08101d;
    background-clip: padding-box;
  }

  .editor::-webkit-scrollbar-thumb:active,
  .tree-view::-webkit-scrollbar-thumb:active,
  .fold-code-view::-webkit-scrollbar-thumb:active,
  .aligned-compare-view::-webkit-scrollbar-thumb:active {
    background: #a8bce0;
    border: 2px solid #08101d;
    background-clip: padding-box;
  }

  .editor::-webkit-scrollbar-corner,
  .tree-view::-webkit-scrollbar-corner,
  .fold-code-view::-webkit-scrollbar-corner,
  .aligned-compare-view::-webkit-scrollbar-corner {
    background: #08101d;
  }

  /* The aligned comparison surface replaces the textarea while a one-sided
     added/removed row needs a visual spacer. It must inherit the same theme as
     the regular JSON/XML Code and Tree scroll surfaces. */
  html[data-theme="light"] .editor,
  html[data-theme="light"] .tree-view,
  html[data-theme="light"] .fold-code-view,
  html[data-theme="light"] .aligned-compare-view {
    scrollbar-color: #94a3b8 #eef2f7 !important;
    color-scheme: light;
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-track,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-track,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-track,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-track {
    background: #eef2f7 !important;
    border-color: #dbe3ee !important;
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-thumb,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-thumb,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-thumb,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-thumb {
    background: #94a3b8 !important;
    border-color: #eef2f7 !important;
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-thumb:hover,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-thumb:hover,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-thumb:hover,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-thumb:hover {
    background: #64748b !important;
    border-color: #eef2f7 !important;
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-thumb:active,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-thumb:active,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-thumb:active,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-thumb:active {
    background: #475569 !important;
    border-color: #eef2f7 !important;
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-corner,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-corner,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-corner,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-corner {
    background: #eef2f7 !important;
  }

  /* Both panes always keep a visible scrollbar. Sync views & scroll controls
     movement only; it must never hide either pane's own navigation affordance. */
`;
document.head.appendChild(style);
