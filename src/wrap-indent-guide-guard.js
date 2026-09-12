const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];

installStyles();
for (let index = 0; index < editors.length; index += 1) refreshLineHeight(index);

window.addEventListener('payloaddiff:word-wrap-changed', (event) => {
  const index = Number(event.detail?.paneIndex);
  if (Number.isInteger(index)) refreshLineHeight(index);
  else editors.forEach((_, paneIndex) => refreshLineHeight(paneIndex));
});

window.addEventListener('payloaddiff:word-wrap-layout', (event) => {
  const index = Number(event.detail?.paneIndex);
  if (Number.isInteger(index)) refreshLineHeight(index);
});

window.addEventListener('payloaddiff:theme-changed', () => {
  editors.forEach((_, index) => refreshLineHeight(index));
});

if (typeof ResizeObserver !== 'undefined') {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const index = editors.indexOf(entry.target);
      if (index >= 0) refreshLineHeight(index);
    }
  });
  editors.forEach((editor) => editor && observer.observe(editor));
}

function refreshLineHeight(index) {
  const pane = panes[index];
  const editor = editors[index];
  if (!pane || !editor) return;
  const style = getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  pane.style.setProperty('--pd-wrap-guide-height', `${lineHeight}px`);
}

function installStyles() {
  if (document.querySelector('#wrap-indent-guide-guard-styles')) return;
  const style = document.createElement('style');
  style.id = 'wrap-indent-guide-guard-styles';
  style.textContent = `
    /* A wrapped logical line can occupy several visual rows. Indentation guides
       belong to the logical line's first row only. Extending them through the
       continuation rows makes wrapped text cross the guide strokes. */
    .pane.word-wrap-active .editor-indent-guide {
      height: var(--pd-wrap-guide-height, 20px) !important;
      max-height: var(--pd-wrap-guide-height, 20px) !important;
    }
  `;
  document.head.appendChild(style);
}
