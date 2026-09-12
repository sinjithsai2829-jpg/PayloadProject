const panes = [...document.querySelectorAll('.pane')];
const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const smartSurfaces = panes.map((pane) => pane?.querySelector('.smart-wrap-view'));
const locks = [false, false];
const directions = [null, null];
const epochs = [0, 0];

for (let index = 0; index < panes.length; index += 1) install(index);

window.PayloadDiffSmartWrapScrollBridge = {
  isSyncingFromSmart: (index) => directions[index] === 'smart-to-editor',
  isSyncingFromEditor: (index) => directions[index] === 'editor-to-smart',
  getDirection: (index) => directions[index] || null,
};

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
  beginBridge(index, 'editor-to-smart');
  surface.scrollTop = smartMax * clampRatio(editor.scrollTop / editorMax);
  releaseBridge(index);
}

function syncFromSmart(index) {
  const editor = editors[index];
  const surface = smartSurfaces[index];
  if (!editor || !surface || !isSmartActive(index) || locks[index]) return;
  const smartMax = Math.max(1, surface.scrollHeight - surface.clientHeight);
  const editorMax = Math.max(0, editor.scrollHeight - editor.clientHeight);
  beginBridge(index, 'smart-to-editor');

  // Smart Wrap is the authoritative visible scroller. Mirror only the
  // proportional position into the hidden textarea so turning Wrap off and the
  // persistent scrollbar remain aligned. The guard blocks this mirrored native
  // scroll from being interpreted as a new logical-line navigation request.
  editor.scrollTop = editorMax * clampRatio(surface.scrollTop / smartMax);
  releaseBridge(index);
}

function beginBridge(index, direction) {
  epochs[index] += 1;
  locks[index] = true;
  directions[index] = direction;
}

function releaseBridge(index) {
  const epoch = epochs[index];
  requestAnimationFrame(() => {
    if (epochs[index] !== epoch) return;
    locks[index] = false;
    directions[index] = null;
    window.PayloadDiffScrollbars?.refresh?.(index);
  });
}

function clampRatio(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function isSmartActive(index) {
  const surface = smartSurfaces[index];
  return !!window.PayloadDiffSmartWrap?.isActive?.(index)
    && !!surface
    && !surface.classList.contains('hidden');
}
