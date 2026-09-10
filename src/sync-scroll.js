const panes = [...document.querySelectorAll('.pane')];
const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');
const syncLabel = document.querySelector('.enhancement-sync');

// The same control now covers branch navigation and scroll synchronization.
if (syncLabel) {
  for (const node of syncLabel.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
      node.nodeValue = ' Sync navigation & scroll';
      break;
    }
  }
}

const scrollLocks = new WeakSet();
let syncFrame = 0;
let pendingSync = null;

function isVisible(element) {
  return !!element && !element.classList.contains('hidden') && element.offsetParent !== null;
}

function viewKind(element) {
  if (element.classList.contains('tree-view')) return 'tree';
  if (element.classList.contains('virtual-code')) return 'virtual';
  if (element.classList.contains('editor')) return 'editor';
  return null;
}

function counterpart(index, kind) {
  const other = index === 0 ? 1 : 0;
  const pane = panes[other];
  if (!pane) return null;
  if (kind === 'tree') return pane.querySelector('.tree-view');
  if (kind === 'virtual') return pane.querySelector('.virtual-code');
  if (kind === 'editor') return pane.querySelector('.editor');
  return null;
}

function maxScrollTop(element) {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function maxScrollLeft(element) {
  return Math.max(0, element.scrollWidth - element.clientWidth);
}

function copyScroll(source, target) {
  if (!isVisible(target)) return;

  const sourceMaxTop = maxScrollTop(source);
  const targetMaxTop = maxScrollTop(target);
  const topRatio = sourceMaxTop > 0 ? source.scrollTop / sourceMaxTop : 0;

  const sourceMaxLeft = maxScrollLeft(source);
  const targetMaxLeft = maxScrollLeft(target);
  const leftRatio = sourceMaxLeft > 0 ? source.scrollLeft / sourceMaxLeft : 0;

  scrollLocks.add(target);
  target.scrollTop = targetMaxTop * topRatio;
  target.scrollLeft = targetMaxLeft * leftRatio;

  requestAnimationFrame(() => scrollLocks.delete(target));
}

function scheduleSync(index, source) {
  if (!syncInput?.checked || scrollLocks.has(source) || !isVisible(source)) return;

  pendingSync = { index, source };
  if (syncFrame) return;

  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    const pending = pendingSync;
    pendingSync = null;
    if (!pending || !syncInput?.checked) return;

    const kind = viewKind(pending.source);
    const target = counterpart(pending.index, kind);
    copyScroll(pending.source, target);
  });
}

for (let index = 0; index < panes.length; index += 1) {
  const pane = panes[index];
  const scrollers = [
    pane.querySelector('.editor'),
    pane.querySelector('.tree-view'),
    pane.querySelector('.virtual-code'),
  ].filter(Boolean);

  for (const scroller of scrollers) {
    scroller.addEventListener('scroll', () => scheduleSync(index, scroller), { passive: true });
  }
}

// When sync is switched back on, immediately align the currently visible views.
syncInput?.addEventListener('change', () => {
  if (!syncInput.checked) return;
  for (const candidate of [
    panes[0]?.querySelector('.tree-view'),
    panes[0]?.querySelector('.virtual-code'),
    panes[0]?.querySelector('.editor'),
  ]) {
    if (!isVisible(candidate)) continue;
    const kind = viewKind(candidate);
    copyScroll(candidate, counterpart(0, kind));
    break;
  }
});
