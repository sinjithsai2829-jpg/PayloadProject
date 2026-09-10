const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const trees = [document.querySelector('#tree0'), document.querySelector('#tree1')];
const panes = [...document.querySelectorAll('.pane')];
const compareBtn = document.querySelector('#compareBtn');
const compareBar = document.querySelector('#compareBar');
const diffPosition = document.querySelector('#diffPosition');
const prevDiff = document.querySelector('#prevDiff');
const nextDiff = document.querySelector('#nextDiff');

const lineDiff = [emptyLineDiff(), emptyLineDiff()];
const rowObservers = [];
let orderedDiffs = [];
let currentDiffIndex = 0;
let pathToIndex = new Map();
let lineToDiff = [[], []];
let scrollSyncFrame = 0;
let pendingScrollSource = null;
let suppressScrollTrackingUntil = 0;
let seq = 0;
const pending = new Map();
const worker = new Worker(new URL('./code-diff-worker.js', import.meta.url), { type: 'module' });

worker.onmessage = ({ data }) => {
  const task = pending.get(data.id);
  if (!task) return;
  pending.delete(data.id);
  data.ok ? task.resolve(data.result) : task.reject(new Error(data.error));
};

function emptyLineDiff() {
  return { added: new Set(), removed: new Set(), modified: new Set() };
}

function runCodeDiff(left, right) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, left, right });
  });
}

function afterBusy(callback) {
  let sawBusy = document.body.classList.contains('busy');
  const check = () => {
    sawBusy ||= document.body.classList.contains('busy');
    if (sawBusy && !document.body.classList.contains('busy')) {
      requestAnimationFrame(callback);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function isJsonMode() {
  return document.querySelector('.mode-btn.active')?.dataset.mode === 'json';
}

compareBtn?.addEventListener('click', () => {
  afterBusy(async () => {
    if (!isJsonMode() || compareBar?.classList.contains('hidden')) return;

    try {
      const result = await runCodeDiff(editors[0].value, editors[1].value);
      setLineDiff(0, result.left);
      setLineDiff(1, result.right);
      setOrderedDiffs(result.ordered || []);
      applyVisibleCodeDiff(0);
      applyVisibleCodeDiff(1);
      await autoExpandChangedTree();
      updateNavigator();
    } catch (error) {
      console.warn('Code diff highlighting unavailable:', error);
    }
  });
}, true);

function setLineDiff(index, value) {
  lineDiff[index] = {
    added: new Set(value.added || []),
    removed: new Set(value.removed || []),
    modified: new Set(value.modified || []),
  };
}

function setOrderedDiffs(diffs) {
  orderedDiffs = diffs;
  currentDiffIndex = 0;
  pathToIndex = new Map();
  lineToDiff = [[], []];

  for (let index = 0; index < diffs.length; index += 1) {
    const diff = diffs[index];
    pathToIndex.set(diff.path, index);
    if (diff.leftLine) lineToDiff[0].push({ line: diff.leftLine, index });
    if (diff.rightLine) lineToDiff[1].push({ line: diff.rightLine, index });
  }

  lineToDiff[0].sort((a, b) => a.line - b.line || a.index - b.index);
  lineToDiff[1].sort((a, b) => a.line - b.line || a.index - b.index);
}

function applyVisibleCodeDiff(index) {
  const rowsRoot = panes[index]?.querySelector('.virtual-rows');
  if (!rowsRoot) return;

  for (const row of rowsRoot.querySelectorAll('.code-row[data-line]')) {
    const line = Number(row.dataset.line);
    row.classList.remove('line-added', 'line-removed', 'line-modified');
    if (lineDiff[index].added.has(line)) row.classList.add('line-added');
    else if (lineDiff[index].removed.has(line)) row.classList.add('line-removed');
    else if (lineDiff[index].modified.has(line)) row.classList.add('line-modified');
  }
}

for (let index = 0; index < 2; index += 1) {
  const rowsRoot = panes[index]?.querySelector('.virtual-rows');
  if (rowsRoot) {
    const observer = new MutationObserver(() => {
      applyVisibleCodeDiff(index);
      focusCurrentCodeLine(index);
    });
    observer.observe(rowsRoot, { childList: true });
    rowObservers.push(observer);
  }

  for (const scroller of [
    panes[index]?.querySelector('.virtual-code'),
    panes[index]?.querySelector('.editor'),
    panes[index]?.querySelector('.tree-view'),
  ].filter(Boolean)) {
    scroller.addEventListener('scroll', () => scheduleVisibleDiffTracking(index, scroller), { passive: true });
  }
}

// Own JSON Previous/Next navigation in the capture phase so the top counter,
// Code view, and Tree view all use the same ordered difference map. XML keeps
// using the original navigation in main.js.
prevDiff?.addEventListener('click', (event) => handleNavigatorClick(event, -1), true);
nextDiff?.addEventListener('click', (event) => handleNavigatorClick(event, 1), true);

function handleNavigatorClick(event, delta) {
  if (!isJsonMode() || !orderedDiffs.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  currentDiffIndex = (currentDiffIndex + delta + orderedDiffs.length) % orderedDiffs.length;
  updateNavigator();
  navigateToCurrentDiff();
}

function updateNavigator() {
  const total = orderedDiffs.length;
  if (!total) return;
  if (diffPosition) diffPosition.textContent = `${currentDiffIndex + 1} of ${total}`;
  if (prevDiff) prevDiff.disabled = false;
  if (nextDiff) nextDiff.disabled = false;
}

async function navigateToCurrentDiff() {
  const diff = orderedDiffs[currentDiffIndex];
  if (!diff) return;
  suppressScrollTrackingUntil = performance.now() + 500;

  if (isTreeViewActive()) {
    await Promise.all([
      revealTreePath(0, diff.path),
      revealTreePath(1, diff.path),
    ]);
  } else {
    scrollCodeToLine(0, diff.leftLine || diff.rightLine);
    scrollCodeToLine(1, diff.rightLine || diff.leftLine);
  }
}

function isTreeViewActive() {
  return panes[0]?.querySelector('.view-btn[data-view="tree"]')?.classList.contains('active');
}

function visibleCodeScroller(index) {
  const virtual = panes[index]?.querySelector('.virtual-code');
  if (isVisible(virtual)) return virtual;
  const editor = panes[index]?.querySelector('.editor');
  return isVisible(editor) ? editor : null;
}

function scrollCodeToLine(index, line) {
  if (!line) return;
  const scroller = visibleCodeScroller(index);
  if (!scroller) return;
  const lineHeight = scroller.classList.contains('virtual-code')
    ? 22
    : (parseFloat(getComputedStyle(scroller).lineHeight) || 20);
  const targetTop = Math.max(0, (line - 1) * lineHeight - scroller.clientHeight * 0.42);
  scroller.scrollTop = targetTop;
  requestAnimationFrame(() => focusCurrentCodeLine(index));
}

function focusCurrentCodeLine(index) {
  const diff = orderedDiffs[currentDiffIndex];
  if (!diff) return;
  const line = index === 0 ? (diff.leftLine || diff.rightLine) : (diff.rightLine || diff.leftLine);
  const rowsRoot = panes[index]?.querySelector('.virtual-rows');
  if (!rowsRoot || !line) return;
  rowsRoot.querySelectorAll('.line-focus').forEach((row) => row.classList.remove('line-focus'));
  rowsRoot.querySelector(`.code-row[data-line="${line}"]`)?.classList.add('line-focus');
}

function scheduleVisibleDiffTracking(index, scroller) {
  if (!orderedDiffs.length || !isJsonMode() || !isVisible(scroller)) return;
  if (performance.now() < suppressScrollTrackingUntil) return;
  pendingScrollSource = { index, scroller };
  if (scrollSyncFrame) return;

  scrollSyncFrame = requestAnimationFrame(() => {
    scrollSyncFrame = 0;
    const pendingSource = pendingScrollSource;
    pendingScrollSource = null;
    if (!pendingSource) return;
    syncNavigatorToVisibleChange(pendingSource.index, pendingSource.scroller);
  });
}

function syncNavigatorToVisibleChange(index, scroller) {
  let nextIndex = null;

  if (scroller.classList.contains('tree-view')) {
    nextIndex = nearestVisibleTreeDiff(scroller);
  } else {
    const lineHeight = scroller.classList.contains('virtual-code')
      ? 22
      : (parseFloat(getComputedStyle(scroller).lineHeight) || 20);
    const centerLine = Math.max(1, Math.round((scroller.scrollTop + scroller.clientHeight / 2) / lineHeight));
    nextIndex = nearestLineDiff(index, centerLine);
  }

  if (nextIndex == null || nextIndex === currentDiffIndex) return;
  currentDiffIndex = nextIndex;
  updateNavigator();
  focusCurrentCodeLine(0);
  focusCurrentCodeLine(1);
}

function nearestLineDiff(side, line) {
  const entries = lineToDiff[side];
  if (!entries.length) return null;

  let lo = 0;
  let hi = entries.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (entries[mid].line < line) lo = mid + 1;
    else hi = mid;
  }

  const right = entries[lo];
  const left = lo > 0 ? entries[lo - 1] : null;
  if (!left) return right.index;
  return Math.abs(left.line - line) <= Math.abs(right.line - line) ? left.index : right.index;
}

function nearestVisibleTreeDiff(tree) {
  const bounds = tree.getBoundingClientRect();
  const center = bounds.top + bounds.height / 2;
  let bestIndex = null;
  let bestDistance = Infinity;

  for (const row of tree.querySelectorAll('.tree-row[data-path].diff-added, .tree-row[data-path].diff-removed, .tree-row[data-path].diff-modified')) {
    const rect = row.getBoundingClientRect();
    if (rect.bottom < bounds.top || rect.top > bounds.bottom) continue;
    const index = pathToIndex.get(row.dataset.path);
    if (index == null) continue;
    const distance = Math.abs((rect.top + rect.bottom) / 2 - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

async function revealTreePath(index, path) {
  const tree = trees[index];
  if (!tree || tree.classList.contains('hidden')) return;

  const ancestors = pathAncestors(path);
  for (const ancestor of ancestors.slice(0, -1)) {
    await makeTreePathVisible(tree, ancestor);
    const row = findTreeRow(tree, ancestor);
    const toggle = row?.querySelector('.tree-toggle');
    if (toggle && !toggle.disabled && toggle.textContent === '▸') {
      toggle.click();
      await nextFrame();
    }
  }

  await makeTreePathVisible(tree, path);
  const row = findTreeRow(tree, path);
  if (row) row.scrollIntoView({ block: 'center' });
}

async function makeTreePathVisible(tree, path) {
  const targetDepth = pathAncestors(path).length - 1;
  for (let guard = 0; guard < 250 && !findTreeRow(tree, path); guard += 1) {
    const moreRows = [...tree.querySelectorAll('.tree-more-row')];
    if (!moreRows.length) break;
    const matchingDepth = moreRows.find((row) => Number(row.style.getPropertyValue('--depth')) === targetDepth);
    const button = (matchingDepth || moreRows[0])?.querySelector('.tree-more');
    if (!button) break;
    button.click();
    await nextFrame();
  }
}

function findTreeRow(tree, path) {
  return [...tree.querySelectorAll('.tree-row[data-path]')].find((row) => row.dataset.path === path) || null;
}

function pathAncestors(path) {
  const out = ['$'];
  if (path === '$') return out;
  const tokens = path.slice(1).match(/\.[A-Za-z_$][\w$]*|\[(?:\d+|"(?:\\.|[^"])*")\]/g) || [];
  let current = '$';
  for (const token of tokens) {
    current += token;
    out.push(current);
  }
  return out;
}

function isVisible(element) {
  return !!element && !element.classList.contains('hidden') && element.offsetParent !== null;
}

// The tree renderer is intentionally lazy for huge payloads. After a compare,
// expand changed branches only until a useful number of changed leaves is
// visible, avoiding a massive DOM expansion on 50k+ line payloads.
async function autoExpandChangedTree() {
  const MAX_VISIBLE_CHANGES = 120;
  const MAX_TOGGLES = 350;

  for (let paneIndex = 0; paneIndex < 2; paneIndex += 1) {
    const tree = trees[paneIndex];
    if (!tree || tree.classList.contains('hidden')) continue;

    let toggles = 0;
    for (;;) {
      const exactCount = tree.querySelectorAll('.tree-row.diff-added, .tree-row.diff-removed, .tree-row.diff-modified').length;
      if (exactCount >= MAX_VISIBLE_CHANGES || toggles >= MAX_TOGGLES) break;

      const branch = [...tree.querySelectorAll('.tree-row.diff-branch')].find((row) => {
        const toggle = row.querySelector('.tree-toggle');
        return toggle && !toggle.disabled && toggle.textContent === '▸';
      });
      if (!branch) break;

      branch.querySelector('.tree-toggle')?.click();
      toggles += 1;
      await nextFrame();
    }
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function clearDiffNavigation() {
  orderedDiffs = [];
  currentDiffIndex = 0;
  pathToIndex = new Map();
  lineToDiff = [[], []];
}

// Clear old code highlights/navigation when either editor changes or mode changes.
editors.forEach((editor, index) => {
  editor.addEventListener('input', () => {
    lineDiff[index] = emptyLineDiff();
    clearDiffNavigation();
    applyVisibleCodeDiff(index);
  });
});

document.querySelectorAll('.mode-btn').forEach((button) => {
  button.addEventListener('click', () => {
    lineDiff[0] = emptyLineDiff();
    lineDiff[1] = emptyLineDiff();
    clearDiffNavigation();
    applyVisibleCodeDiff(0);
    applyVisibleCodeDiff(1);
  });
});
