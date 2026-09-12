const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];

for (let index = 0; index < editors.length; index += 1) {
  const editor = editors[index];
  if (!editor) continue;

  // The Smart Wrap bridge mirrors its visible surface into the hidden textarea
  // so the persistent scrollbar and wrap-off position stay proportional. That
  // mirrored textarea scroll must not be interpreted as a new navigation
  // request by Smart Wrap itself, or the view snaps to a logical-line boundary
  // (and huge one-line payloads can snap straight back to the end).
  editor.addEventListener('scroll', (event) => {
    if (!window.PayloadDiffSmartWrap?.isActive?.(index)) return;
    if (!window.PayloadDiffSmartWrapScrollBridge?.isSyncingFromSmart?.(index)) return;
    event.stopImmediatePropagation();
  }, { capture: true, passive: true });
}
