const style = document.createElement('style');
style.id = 'scrollbar-visibility-styles';
style.textContent = `
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
    width: 16px;
    height: 16px;
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
    min-height: 48px;
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

  /* Light mode needs stronger contrast than the previous pale gray-on-gray
     treatment. This is especially important on macOS/Chrome where overlay
     scrollbars can otherwise visually disappear against the editor surface. */
  html[data-theme="light"] .editor,
  html[data-theme="light"] .tree-view,
  html[data-theme="light"] .fold-code-view,
  html[data-theme="light"] .aligned-compare-view {
    scrollbar-width: auto !important;
    scrollbar-color: #475569 #e2e8f0 !important;
    scrollbar-gutter: stable;
    color-scheme: light;
  }

  html[data-theme="light"] .editor::-webkit-scrollbar,
  html[data-theme="light"] .tree-view::-webkit-scrollbar,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar {
    width: 16px;
    height: 16px;
    background: #e2e8f0;
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-track,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-track,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-track,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-track {
    background: #e2e8f0 !important;
    border-left: 1px solid #cbd5e1 !important;
    box-shadow: inset 1px 0 0 rgba(15,23,42,.08);
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-thumb,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-thumb,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-thumb,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-thumb {
    min-height: 48px;
    background: #475569 !important;
    border: 3px solid #e2e8f0 !important;
    border-radius: 999px;
    background-clip: padding-box;
    box-shadow: inset 0 0 0 1px rgba(15,23,42,.22);
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-thumb:hover,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-thumb:hover,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-thumb:hover,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-thumb:hover {
    background: #334155 !important;
    border-color: #e2e8f0 !important;
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-thumb:active,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-thumb:active,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-thumb:active,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-thumb:active {
    background: #1e293b !important;
    border-color: #e2e8f0 !important;
  }

  html[data-theme="light"] .editor::-webkit-scrollbar-corner,
  html[data-theme="light"] .tree-view::-webkit-scrollbar-corner,
  html[data-theme="light"] .fold-code-view::-webkit-scrollbar-corner,
  html[data-theme="light"] .aligned-compare-view::-webkit-scrollbar-corner {
    background: #e2e8f0 !important;
  }

  /* Both panes always keep their own scrollbar/gutter. Sync views & scroll
     controls movement only; it must never remove either pane's navigation
     affordance. This shared selector intentionally has no JSON/XML branch. */
`;
document.head.appendChild(style);
