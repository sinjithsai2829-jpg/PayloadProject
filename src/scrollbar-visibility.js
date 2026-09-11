const style = document.createElement('style');
style.id = 'scrollbar-visibility-styles';
style.textContent = `
  .editor,
  .tree-view,
  .fold-code-view {
    scrollbar-width: auto;
    scrollbar-color: #647896 #08101d;
  }

  .editor::-webkit-scrollbar,
  .tree-view::-webkit-scrollbar,
  .fold-code-view::-webkit-scrollbar {
    width: 14px;
    height: 14px;
  }

  .editor::-webkit-scrollbar-track,
  .tree-view::-webkit-scrollbar-track,
  .fold-code-view::-webkit-scrollbar-track {
    background: #08101d;
    border-left: 1px solid #1e2a40;
  }

  .editor::-webkit-scrollbar-thumb,
  .tree-view::-webkit-scrollbar-thumb,
  .fold-code-view::-webkit-scrollbar-thumb {
    min-height: 44px;
    background: #647896;
    border: 3px solid #08101d;
    border-radius: 999px;
    background-clip: padding-box;
  }

  .editor::-webkit-scrollbar-thumb:hover,
  .tree-view::-webkit-scrollbar-thumb:hover,
  .fold-code-view::-webkit-scrollbar-thumb:hover {
    background: #8aa0c2;
    border: 2px solid #08101d;
    background-clip: padding-box;
  }

  .editor::-webkit-scrollbar-thumb:active,
  .tree-view::-webkit-scrollbar-thumb:active,
  .fold-code-view::-webkit-scrollbar-thumb:active {
    background: #a8bce0;
    border: 2px solid #08101d;
    background-clip: padding-box;
  }

  .editor::-webkit-scrollbar-corner,
  .tree-view::-webkit-scrollbar-corner,
  .fold-code-view::-webkit-scrollbar-corner {
    background: #08101d;
  }

  /* Both panes always keep a visible scrollbar. Sync views & scroll controls
     movement only; it must never hide either pane's own navigation affordance. */
`;
document.head.appendChild(style);
