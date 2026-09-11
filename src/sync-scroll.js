const panes = [...document.querySelectorAll('.pane')];
const syncInput = document.querySelector('.enhancement-sync input[type="checkbox"]');
const syncLabel = document.querySelector('.enhancement-sync');

if (syncLabel) {
  for (const node of syncLabel.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
      node.nodeValue = ' Sync views & scroll';
      break;
    }
  }
}

const scrollLocks = new WeakSet();
let syncFrame = 0;
let pendingSync = null;
let syncingView = false;

function isVisible(element) {
  return !!element && !element.classList.contains('hidden') && element.offsetParent !== null;
}

function isTree(element) {
  return element?.classList.contains('tree-view');
}

function isCode(element) {
  return element?.classList.contains('editor') || element?.classList.contains('fold-code-view');
}

function visibleCodeScroller(pane) {
  const folded = pane?.querySelector('.fold-code-view');
  if (isVisible(folded)) return folded;
  const editor = pane?.querySelector('.editor');
  return isVisible(editor) ? editor : null;
}

function visibleScroller(pane) {
  const tree = pane?.querySelector('.tree-view');
  if (isVisible(tree)) return tree;
  return visibleCodeScroller(pane);
}

function counterpart(index, source) {
  const otherPane = panes[index === 0 ? 1 : 0];
  if (!otherPane || !source) return null;
  if (isTree(source)) return otherPane.querySelector('.tree-view');
  if (isCode(source)) return visibleCodeScroller(otherPane);
  return null;
}

function maxScrollTop(element) {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function maxScrollLeft(element) {
  return Math.max(0, element.scrollWidth - element.clientWidth);
}

function copyScroll(source, target) {
  if (!source || !target || !isVisible(source) || !isVisible(target)) return;

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
    copyScroll(pending.source, counterpart(pending.index, pending.source));
  });
}

for (let index = 0; index < panes.length; index += 1) {
  const bindScroller = (scroller) => scroller?.addEventListener('scroll', () => scheduleSync(index, scroller), { passive: true });
  bindScroller(panes[index].querySelector('.editor'));
  bindScroller(panes[index].querySelector('.tree-view'));

  // Folded code views are injected after this module loads. Bind once they
  // exist, and also listen for fold-state changes in case a pane switches into
  // the folded projection later.
  requestAnimationFrame(() => bindScroller(panes[index].querySelector('.fold-code-view')));
}

window.addEventListener('payloaddiff:fold-state-changed', () => {
  if (syncInput?.checked) requestAnimationFrame(alignViewsFromLeft);
});

function mirrorView(sourceIndex, view) {
  if (!syncInput?.checked || syncingView) return;

  const targetIndex = sourceIndex === 0 ? 1 : 0;
  const targetPane = panes[targetIndex];
  const targetButton = targetPane?.querySelector(`.view-btn[data-view="${view}"]`);
  if (!targetButton || targetButton.classList.contains('active')) return;

  syncingView = true;
  targetButton.click();
  requestAnimationFrame(() => {
    syncingView = false;
    copyScroll(visibleScroller(panes[sourceIndex]), visibleScroller(targetPane));
  });
}

for (let index = 0; index < panes.length; index += 1) {
  const tabs = panes[index].querySelector('.view-tabs');
  tabs?.addEventListener('click', (event) => {
    const button = event.target.closest('.view-btn');
    if (!button) return;
    requestAnimationFrame(() => mirrorView(index, button.dataset.view));
  });
}

function alignViewsFromLeft() {
  if (!syncInput?.checked) return;

  const leftPane = panes[0];
  const rightPane = panes[1];
  if (!leftPane || !rightPane) return;

  const leftTreeActive = leftPane.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
  const desiredView = leftTreeActive ? 'tree' : 'code';
  const rightButton = rightPane.querySelector(`.view-btn[data-view="${desiredView}"]`);

  if (rightButton && !rightButton.classList.contains('active')) {
    syncingView = true;
    rightButton.click();
    requestAnimationFrame(() => {
      syncingView = false;
      copyScroll(visibleScroller(leftPane), visibleScroller(rightPane));
    });
  } else {
    copyScroll(visibleScroller(leftPane), visibleScroller(rightPane));
  }
}

function updateSyncUiState() {
  document.documentElement.classList.toggle('sync-scroll-enabled', !!syncInput?.checked);
}

updateSyncUiState();

syncInput?.addEventListener('change', () => {
  updateSyncUiState();
  if (syncInput.checked) requestAnimationFrame(alignViewsFromLeft);
});
