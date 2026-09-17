const wraps = [...document.querySelectorAll('.editor-wrap')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];

installStyles();
installScrollBridge();

// Aligned comparison is a separate surface layered over the normal editor.
// The normal fold gutter is intentionally hidden by that surface, which made
// JSON/XML collapse arrows disappear exactly when users need them to navigate a
// large comparison. Keep the existing shared JSON/XML folding implementation
// visible over the aligned surface. If a fold is collapsed, temporarily show
// the existing folded projection for that pane; expanding the final fold
// automatically returns to aligned comparison.
function installStyles() {
  if (document.querySelector('#aligned-fold-bridge-styles')) return;
  const style = document.createElement('style');
  style.id = 'aligned-fold-bridge-styles';
  style.textContent = `
    .editor-wrap.aligned-compare-active:not(.folding-active) > .code-fold-gutter {
      visibility: visible !important;
      pointer-events: auto !important;
      z-index: 31 !important;
    }

    .editor-wrap.aligned-compare-active.folding-active > .aligned-compare-view {
      display: none !important;
      pointer-events: none !important;
    }

    .editor-wrap.aligned-compare-active.folding-active > .fold-code-view {
      display: block !important;
      visibility: visible !important;
      pointer-events: auto !important;
      z-index: 30 !important;
    }

    .editor-wrap.aligned-compare-active.folding-active > .code-fold-gutter {
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}

function installScrollBridge() {
  for (let index = 0; index < wraps.length; index += 1) {
    const wrap = wraps[index];
    const editor = editors[index];
    const aligned = wrap?.querySelector('.aligned-compare-view');
    if (!wrap || !editor || !aligned) continue;

    aligned.addEventListener('scroll', () => {
      if (!wrap.classList.contains('aligned-compare-active') || wrap.classList.contains('folding-active')) return;
      // The fold gutter is positioned from the underlying editor's scrollTop.
      // Mirror vertical scroll so its arrows stay beside the same source lines
      // rendered by the aligned comparison surface.
      editor.scrollTop = aligned.scrollTop;
      window.PayloadDiffCodeFolding?.refresh?.();
    }, { passive: true });
  }
}
