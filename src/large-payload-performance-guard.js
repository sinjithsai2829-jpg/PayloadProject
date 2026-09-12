const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];

// This listener is intentionally installed before legacy editor enhancements.
// Main state + persistence + large-payload indexing may observe the change first;
// then expensive full-document listeners are stopped for virtualized payloads.
editors.forEach((editor, index) => {
  editor?.addEventListener('input', (event) => {
    if (!window.PayloadDiffLargePayload?.isLarge?.(index)) return;
    event.stopImmediatePropagation();
    try {
      window.PayloadDiffDiagnostics?.log?.('debug', 'large-payload.legacy-input-blocked', {
        pane: index + 1,
        chars: editor.value.length,
      });
    } catch (_) {}
  });
});
