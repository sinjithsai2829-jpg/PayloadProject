const editors = [document.querySelector('#editor0'), document.querySelector('#editor1')];
const trees = [document.querySelector('#tree0'), document.querySelector('#tree1')];
const panes = [...document.querySelectorAll('.pane')];
const compareBtn = document.querySelector('#compareBtn');
const compareBar = document.querySelector('#compareBar');

const lineDiff = [emptyLineDiff(), emptyLineDiff()];
const rowObservers = [];
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
      applyVisibleCodeDiff(0);
      applyVisibleCodeDiff(1);
      await autoExpandChangedTree();
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
  if (!rowsRoot) continue;
  const observer = new MutationObserver(() => applyVisibleCodeDiff(index));
  observer.observe(rowsRoot, { childList: true });
  rowObservers.push(observer);
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

// Clear old code highlights when either editor changes or the mode changes.
editors.forEach((editor, index) => {
  editor.addEventListener('input', () => {
    lineDiff[index] = emptyLineDiff();
    applyVisibleCodeDiff(index);
  });
});

document.querySelectorAll('.mode-btn').forEach((button) => {
  button.addEventListener('click', () => {
    lineDiff[0] = emptyLineDiff();
    lineDiff[1] = emptyLineDiff();
    applyVisibleCodeDiff(0);
    applyVisibleCodeDiff(1);
  });
});
