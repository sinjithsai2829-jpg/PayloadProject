const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const smartSurfaces = panes.map((pane) => pane?.querySelector('.smart-wrap-view'));
const locks = [false, false];

for (let index = 0; index < panes.length; index += 1) install(index);

window.addEventListener('payloaddiff:smart-wrap-layout', (event) => {
  const index = Number(event.detail?.paneIndex);
  if (Number.isInteger(index)) syncFromEditor(index);
});
window.addEventListener('payloaddiff:word-wrap-changed', () => {
  requestAnimationFrame(() => editors.forEach((_, index) => syncFromEditor(index)));
});

function install(index) {
  const editor = editors[index];
  const surface = smartSurfaces[index];
  if (!editor || !surface) return;

  editor.addEventListener('scroll', () => {
    if (!isSmartActive(index) || locks[index]) return;
    syncFromEditor(index);
  }, { passive: true });

  surface.addEventListener('scroll', () => {
    if (!isSmartActive(index) || locks[index]) return;
    syncFromSmart(index);
  }, { passive: true });
}

function syncFromEditor(index) {
  const editor = editors[index];
  const surface = smartSurfaces[index];
  if (!editor || !surface || !isSmartActive(index) || locks[index]) return;
  const editorMax = Math.max(1, editor.scrollHeight - editor.clientHeight);
  const smartMax = Math.max(0, surface.scrollHeight - surface.clientHeight);
  locks[index] = true;
  surface.scrollTop = smartMax * Math.min(1, Math.max(0, editor.scrollTop / editorMax));
  requestAnimationFrame(() => {
    locks[index] = false;
    window.PayloadDiffScrollbars?.refresh?.(index);
  });
}

function syncFromSmart(index) {
  const editor = editors[index];
  const surface = smartSurfaces[index];
  if (!editor || !surface || !isSmartActive(index) || locks[index]) return;
  const smartMax = Math.max(1, surface.scrollHeight - surface.clientHeight);
  const editorMax = Math.max(0, editor.scrollHeight - editor.clientHeight);
  locks[index] = true;
  editor.scrollTop = editorMax * Math.min(1, Math.max(0, surface.scrollTop / smartMax));
  requestAnimationFrame(() => {
    locks[index] = false;
    window.PayloadDiffScrollbars?.refresh?.(index);
  });
}

function isSmartActive(index) {
  const surface = smartSurfaces[index];
  return !!window.PayloadDiffSmartWrap?.isActive?.(index)
    && !!surface
    && !surface.classList.contains('hidden');
}
