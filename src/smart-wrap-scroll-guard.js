const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];

for (let index = 0; index < editors.length; index += 1) {
  const editor = editors[index];
  if (!editor) continue;

  // Smart Wrap mirrors its visible scroll position into the hidden textarea.
  // That mirrored scroll is bookkeeping, not a navigation request. Stop it
  // before Smart Wrap's textarea scroll listener can convert the textarea's
  // large wrapped pixel offset into a logical line and snap the visible surface
  // back to the end of a huge line.
  editor.addEventListener('scroll', (event) => {
    if (!window.PayloadDiffSmartWrap?.isActive?.(index)) return;
    if (!window.PayloadDiffSmartWrapScrollBridge?.isSyncingFromSmart?.(index)) return;
    event.stopImmediatePropagation();
  }, { capture: true, passive: true });
}
